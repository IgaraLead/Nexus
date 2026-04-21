class Whatsapp::IncomingCallService
  pattr_initialize [:inbox!, :params!]

  def perform
    return unless inbox.account.feature_enabled?('whatsapp_call')

    calls = params[:calls]
    return if calls.blank?

    calls.each do |call_payload|
      process_call_event(call_payload.with_indifferent_access)
    end
  end

  private

  def process_call_event(call_payload)
    case call_payload[:event]
    when 'connect' then handle_call_connect(call_payload)
    when 'terminate' then handle_call_terminate(call_payload)
    else Rails.logger.warn "[WHATSAPP CALL] Unknown call event: #{call_payload[:event]}"
    end
  end

  def handle_call_connect(call_payload)
    provider_call_id = call_payload[:id]
    direction = map_direction(call_payload[:direction])

    # For outbound calls, a Call record already exists from initiate.
    # Update it instead of creating a duplicate.
    existing_call = Call.whatsapp.find_by(provider_call_id: provider_call_id)
    if existing_call
      Rails.logger.info "[WHATSAPP CALL] call_connect for existing call #{provider_call_id} (direction=#{direction})"
      # Guard against race condition: skip if already in_progress (agent accepted via CallService)
      return if existing_call.in_progress?

      sdp_answer = fix_sdp_setup(call_payload.dig(:session, :sdp))
      existing_call.update!(status: 'in_progress', started_at: Time.current, meta: (existing_call.meta || {}).merge('sdp_answer' => sdp_answer))
      Whatsapp::CallMessageBuilder.update_status!(call: existing_call, status: 'in_progress')
      update_conversation_call_status(existing_call.conversation, 'in-progress', existing_call.direction_label)
      broadcast_outbound_call_connected(existing_call, sdp_answer)
      return
    end

    contact = find_or_create_contact("+#{call_payload[:from]}")
    return unless contact

    conversation = find_or_create_conversation(contact)
    return unless conversation

    call = create_call_record(call_payload, conversation, contact, direction)
    create_voice_call_message(conversation, call)
    update_conversation_call_status(conversation, 'ringing', call.direction_label)
    broadcast_incoming_call(call, contact, call_payload.dig(:session, :sdp))
  rescue ActiveRecord::RecordNotUnique
    Rails.logger.warn "[WHATSAPP CALL] Duplicate provider_call_id received: #{provider_call_id}"
  end

  def create_voice_call_message(conversation, call, user: nil)
    message = Whatsapp::CallMessageBuilder.create!(conversation: conversation, call: call, user: user)
    call.update!(message_id: message.id)
  rescue StandardError => e
    Rails.logger.error "[WHATSAPP CALL] Failed to create voice_call message: #{e.message}"
  end

  def create_call_record(call_payload, conversation, contact, direction)
    Call.create!(
      provider: :whatsapp,
      account: inbox.account,
      inbox: inbox,
      conversation: conversation,
      contact: contact,
      provider_call_id: call_payload[:id],
      direction: direction,
      status: 'ringing',
      meta: { sdp_offer: call_payload.dig(:session, :sdp), ice_servers: default_ice_servers }
    )
  end

  def handle_call_terminate(call_payload)
    provider_call_id = call_payload[:id]
    duration = call_payload[:duration]&.to_i
    end_reason = call_payload[:terminate_reason]

    call = Call.whatsapp.find_by(provider_call_id: provider_call_id)
    return unless call

    # Determine if the call was answered: check in_progress status, duration > 0,
    # or accepted_by_agent_id presence (handles webhook race conditions)
    was_answered = call.in_progress? || duration.to_i.positive? || call.accepted_by_agent_id.present?
    final_status = was_answered ? 'completed' : 'no_answer'
    call.update!(
      status: final_status,
      duration_seconds: duration,
      end_reason: end_reason
    )

    agent = call.accepted_by_agent if call.accepted_by_agent_id.present?
    Whatsapp::CallMessageBuilder.update_status!(call: call, status: final_status, agent: agent, duration_seconds: duration)
    mapped = Whatsapp::CallMessageBuilder::CALL_TO_VOICE_STATUS[final_status] || final_status
    update_conversation_call_status(call.conversation, mapped, call.direction_label)
    broadcast_call_ended(call)

    # Fetch recording from media server if a session was active
    Whatsapp::CallRecordingFetchJob.perform_later(call.id) if call.media_session_id.present?
  end

  def find_or_create_contact(phone_number)
    waid = phone_number.delete('+')

    contact_inbox = ::ContactInboxWithContactBuilder.new(
      source_id: waid,
      inbox: inbox,
      contact_attributes: {
        name: phone_number,
        phone_number: phone_number
      }
    ).perform

    contact_inbox&.contact
  end

  def find_or_create_conversation(contact)
    contact_inbox = contact.contact_inboxes.find_by(inbox: inbox)
    return unless contact_inbox

    conversation = contact_inbox.conversations.where.not(status: :resolved).last
    return conversation if conversation

    ::Conversation.create!(
      account_id: inbox.account_id,
      inbox: inbox,
      contact: contact,
      contact_inbox: contact_inbox,
      additional_attributes: { channel: 'whatsapp' }
    )
  end

  def update_conversation_call_status(conversation, call_status, direction)
    attrs = (conversation.additional_attributes || {}).merge(
      'call_status' => call_status,
      'call_direction' => direction
    )
    conversation.update!(additional_attributes: attrs)
  end

  def broadcast_incoming_call(call, contact, sdp_offer)
    data = {
      account_id: inbox.account_id,
      id: call.id,
      call_id: call.provider_call_id,
      direction: call.direction_label,
      inbox_id: call.inbox_id,
      conversation_id: call.conversation_id,
      caller: {
        name: contact.name,
        phone: contact.phone_number,
        avatar: contact.avatar_url
      }
    }

    # When media server is enabled, the browser does not need Meta's SDP since
    # the Go sidecar handles the Meta-side peer connection directly.
    unless Call.media_server_enabled?
      data[:sdp_offer] = sdp_offer
      data[:ice_servers] = default_ice_servers
    end

    ActionCable.server.broadcast("account_#{inbox.account_id}", { event: 'whatsapp_call.incoming', data: data })
  end

  def broadcast_call_ended(call)
    payload = {
      event: 'whatsapp_call.ended',
      data: {
        account_id: inbox.account_id,
        id: call.id,
        call_id: call.provider_call_id,
        status: call.status,
        duration_seconds: call.duration_seconds,
        conversation_id: call.conversation_id
      }
    }

    ActionCable.server.broadcast("account_#{inbox.account_id}", payload)
  end

  def broadcast_outbound_call_connected(call, sdp_answer)
    payload = {
      event: 'whatsapp_call.outbound_connected',
      data: {
        account_id: inbox.account_id,
        id: call.id,
        call_id: call.provider_call_id,
        conversation_id: call.conversation_id,
        sdp_answer: sdp_answer
      }
    }

    ActionCable.server.broadcast("account_#{inbox.account_id}", payload)
  end

  # Meta sends "USER_INITIATED" / "BUSINESS_INITIATED", map to Call enum values
  def map_direction(raw_direction)
    return :outgoing if raw_direction&.upcase == 'BUSINESS_INITIATED'

    :incoming
  end

  def default_ice_servers
    [{ urls: 'stun:stun.l.google.com:19302' }]
  end

  def fix_sdp_setup(sdp)
    sdp.present? ? sdp.gsub('a=setup:actpass', 'a=setup:active') : sdp
  end
end
