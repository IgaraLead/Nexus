class Whatsapp::IncomingCallService
  pattr_initialize [:inbox!, :params!]

  def perform
    return unless inbox.channel.provider_config['calling_enabled']

    Array(params[:calls]).each do |call_payload|
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
    existing = find_call(call_payload)
    if existing&.outgoing?
      handle_outbound_connect(existing, call_payload)
    elsif existing
      Rails.logger.info "[WHATSAPP CALL] Duplicate inbound connect for #{call_payload[:id]}; ignoring"
    else
      handle_inbound_connect(call_payload)
    end
  rescue ActiveRecord::RecordNotUnique
    Rails.logger.warn "[WHATSAPP CALL] Duplicate provider_call_id received: #{call_payload[:id]}"
  end

  def handle_outbound_connect(call, call_payload)
    # `in_progress?` skips duplicate connect deliveries; `terminal?` stops a
    # delayed connect from reopening an already-ended call.
    return if call.in_progress? || call.terminal?

    sdp_answer = fix_sdp_setup(call_payload.dig(:session, :sdp))
    finalize_status!(call, 'in_progress',
                     started_at: Time.current,
                     meta: (call.meta || {}).merge('sdp_answer' => sdp_answer))
    broadcast(call, 'voice_call.outbound_connected', sdp_answer: sdp_answer)
  end

  # Inbound delegates to Voice::InboundCallBuilder for contact + conversation +
  # call + message creation; auto-assignment falls out of the standard
  # Conversation lifecycle. We just stash Meta's SDP offer in meta.
  def handle_inbound_connect(call_payload)
    sdp_offer = call_payload.dig(:session, :sdp)
    call = Voice::InboundCallBuilder.perform!(
      inbox: inbox,
      from_number: "+#{call_payload[:from]}", call_sid: call_payload[:id],
      provider: :whatsapp,
      extra_meta: { 'sdp_offer' => sdp_offer, 'ice_servers' => Call.default_ice_servers }
    )
    update_conversation_call_status(call)
    broadcast_incoming_call(call, sdp_offer)
  end

  def handle_call_terminate(call_payload)
    call = find_call(call_payload)
    return unless call

    duration = call_payload[:duration]&.to_i
    status = answered?(call, duration) ? 'completed' : 'no_answer'
    finalize_status!(call, status, duration_seconds: duration, end_reason: call_payload[:terminate_reason])
    broadcast(call, 'voice_call.ended', status: call.status, duration_seconds: call.duration_seconds)
  end

  def find_call(call_payload)
    Call.whatsapp.find_by(provider_call_id: call_payload[:id])
  end

  # `accepted_by_agent_id` only signals an answered call for INBOUND — outbound
  # calls have the initiating agent set before the contact picks up.
  def answered?(call, duration)
    call.in_progress? || duration.to_i.positive? || (call.incoming? && call.accepted_by_agent_id.present?)
  end

  # The trio that always moves together when a call's status changes:
  # update the Call row, refresh the message bubble, and sync the
  # conversation's `additional_attributes` for the FE.
  def finalize_status!(call, status, **call_attrs)
    call.update!(status: status, **call_attrs)
    Voice::CallMessageBuilder.update_status!(call: call, status: status, agent: call.accepted_by_agent,
                                             duration_seconds: call_attrs[:duration_seconds])
    update_conversation_call_status(call)
  end

  def update_conversation_call_status(call)
    call.conversation.update!(
      additional_attributes: (call.conversation.additional_attributes || {}).merge(
        'call_status' => call.display_status, 'call_direction' => call.direction_label
      )
    )
  end

  def broadcast_incoming_call(call, sdp_offer)
    contact = call.contact
    payload = { event: 'voice_call.incoming', data: base_payload(call).merge(
      direction: call.direction_label, inbox_id: call.inbox_id,
      sdp_offer: sdp_offer, ice_servers: Call.default_ice_servers,
      caller: { name: contact.name, phone: contact.phone_number, avatar: contact.avatar_url }
    ) }
    incoming_call_streams(call).each { |s| ActionCable.server.broadcast(s, payload) }
  end

  # Ring only the conversation's assignee when assigned, account-wide otherwise
  # so any eligible agent can pick up.
  def incoming_call_streams(call)
    token = call.conversation.assignee&.pubsub_token
    token ? [token] : ["account_#{inbox.account_id}"]
  end

  def broadcast(call, event, **extra)
    ActionCable.server.broadcast(
      "account_#{inbox.account_id}",
      { event: event, data: base_payload(call).merge(extra) }
    )
  end

  def base_payload(call)
    {
      account_id: inbox.account_id, id: call.id, call_id: call.provider_call_id,
      provider: 'whatsapp', conversation_id: call.conversation_id
    }
  end

  # Browsers always emit a=setup:active in answers, but Meta sometimes echoes
  # actpass in its outbound answer; pin it to active so peers don't renegotiate.
  def fix_sdp_setup(sdp)
    sdp.present? ? sdp.gsub('a=setup:actpass', 'a=setup:active') : sdp
  end
end
