class Whatsapp::IncomingCallService
  pattr_initialize [:inbox!, :params!]

  def perform
    return unless inbox.channel.provider_config['calling_enabled']

    Array(params[:calls]).each { |c| handle_event(c.with_indifferent_access) }
  end

  private

  def handle_event(payload)
    case payload[:event]
    when 'connect' then handle_connect(payload)
    when 'terminate' then handle_terminate(payload)
    else Rails.logger.warn "[WHATSAPP CALL] Unknown call event: #{payload[:event]}"
    end
  end

  def handle_connect(payload)
    call = Call.whatsapp.find_by(provider_call_id: payload[:id])
    return handle_inbound_connect(payload) if call.nil?
    return handle_outbound_connect(call, payload) if call.outgoing?

    Rails.logger.info "[WHATSAPP CALL] Duplicate inbound connect for #{payload[:id]}; ignoring"
  rescue ActiveRecord::RecordNotUnique
    Rails.logger.warn "[WHATSAPP CALL] Duplicate provider_call_id received: #{payload[:id]}"
  end

  # Inbound delegates to Voice::InboundCallBuilder for contact + conversation +
  # call + message creation; auto-assignment falls out of the standard
  # Conversation lifecycle. We just stash Meta's SDP offer in meta.
  def handle_inbound_connect(payload)
    sdp_offer = payload.dig(:session, :sdp)
    call = Voice::InboundCallBuilder.perform!(
      inbox: inbox, from_number: "+#{payload[:from]}", call_sid: payload[:id],
      provider: :whatsapp,
      extra_meta: { 'sdp_offer' => sdp_offer, 'ice_servers' => Call.default_ice_servers }
    )
    update_conversation(call)
    broadcast_incoming(call, sdp_offer)
  end

  def handle_outbound_connect(call, payload)
    # `in_progress?` skips duplicate connect deliveries; `terminal?` stops a
    # delayed connect from reopening an already-ended call.
    return if call.in_progress? || call.terminal?

    # Browsers always emit a=setup:active in answers, but Meta sometimes echoes
    # actpass; pin it to active so peers don't renegotiate.
    sdp_answer = payload.dig(:session, :sdp)&.gsub('a=setup:actpass', 'a=setup:active')
    update_call!(call, 'in_progress',
                 started_at: Time.current,
                 meta: (call.meta || {}).merge('sdp_answer' => sdp_answer))
    broadcast(call, 'voice_call.outbound_connected', sdp_answer: sdp_answer)
  end

  def handle_terminate(payload)
    call = Call.whatsapp.find_by(provider_call_id: payload[:id])
    return unless call

    duration = payload[:duration]&.to_i
    update_call!(call, answered?(call, duration) ? 'completed' : 'no_answer',
                 duration_seconds: duration, end_reason: payload[:terminate_reason])
    broadcast(call, 'voice_call.ended', status: call.status, duration_seconds: call.duration_seconds)
  end

  # `accepted_by_agent_id` only signals an answered call for INBOUND — outbound
  # calls have the initiating agent set before the contact picks up.
  def answered?(call, duration)
    call.in_progress? || duration.to_i.positive? || (call.incoming? && call.accepted_by_agent_id.present?)
  end

  # The trio that always moves together when a call's status changes:
  # update the Call row, refresh the message bubble, and sync the conversation
  # additional_attributes for the FE.
  def update_call!(call, status, **attrs)
    call.update!(status: status, **attrs)
    Voice::CallMessageBuilder.update_status!(call: call, status: status, agent: call.accepted_by_agent,
                                             duration_seconds: attrs[:duration_seconds])
    update_conversation(call)
  end

  def update_conversation(call)
    call.conversation.update!(
      additional_attributes: (call.conversation.additional_attributes || {}).merge(
        'call_status' => call.display_status, 'call_direction' => call.direction_label
      )
    )
  end

  # Ring only the conversation's assignee when assigned, account-wide otherwise
  # so any eligible agent can pick up.
  def broadcast_incoming(call, sdp_offer)
    contact = call.contact
    data = base_payload(call).merge(
      direction: call.direction_label, inbox_id: call.inbox_id,
      sdp_offer: sdp_offer, ice_servers: Call.default_ice_servers,
      caller: { name: contact.name, phone: contact.phone_number, avatar: contact.avatar_url }
    )
    streams = call.conversation.assignee&.pubsub_token ? [call.conversation.assignee.pubsub_token] : ["account_#{inbox.account_id}"]
    streams.each { |s| ActionCable.server.broadcast(s, { event: 'voice_call.incoming', data: data }) }
  end

  def broadcast(call, event, **extra)
    ActionCable.server.broadcast("account_#{inbox.account_id}",
                                 { event: event, data: base_payload(call).merge(extra) })
  end

  def base_payload(call)
    { account_id: inbox.account_id, id: call.id, call_id: call.provider_call_id,
      provider: 'whatsapp', conversation_id: call.conversation_id }
  end
end
