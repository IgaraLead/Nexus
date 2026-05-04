class Whatsapp::IncomingCallService
  pattr_initialize [:inbox!, :params!]

  def perform
    return unless inbox.channel.voice_enabled?

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
    return create_inbound_call(payload) if call.nil?
    return accept_outbound_call(call, payload) if call.outgoing?

    Rails.logger.info "[WHATSAPP CALL] Duplicate inbound connect for #{payload[:id]}; ignoring"
  rescue ActiveRecord::RecordNotUnique
    Rails.logger.warn "[WHATSAPP CALL] Duplicate provider_call_id received: #{payload[:id]}"
  end

  def create_inbound_call(payload)
    sdp_offer = payload.dig(:session, :sdp)
    call = Voice::InboundCallBuilder.perform!(
      inbox: inbox, from_number: "+#{payload[:from]}", call_sid: payload[:id],
      provider: :whatsapp,
      extra_meta: { 'sdp_offer' => sdp_offer, 'ice_servers' => Call.default_ice_servers }
    )
    update_conversation(call)
    broadcast_incoming(call, sdp_offer)
  end

  def accept_outbound_call(call, payload)
    return if call.in_progress? || call.terminal?

    # Pin setup:active so browsers don't renegotiate when Meta echoes actpass.
    sdp_answer = payload.dig(:session, :sdp)&.gsub('a=setup:actpass', 'a=setup:active')
    update_call!(call, 'in_progress',
                 started_at: Time.current,
                 meta: (call.meta || {}).merge('sdp_answer' => sdp_answer))
    broadcast(call, 'voice_call.outbound_connected', sdp_answer: sdp_answer)
  end

  def handle_terminate(payload)
    # Webhooks can arrive out of order (terminate before connect under tunnel/network
    # delays). Materialise a missed-call record so the contact's "called and hung up"
    # still surfaces in the dashboard instead of being silently dropped.
    call = Call.whatsapp.find_by(provider_call_id: payload[:id]) || build_missed_inbound_call(payload)
    return unless call

    duration = payload[:duration]&.to_i
    status = answered?(call, duration) ? 'completed' : 'no_answer'
    meta = (call.meta || {}).merge('ended_at' => Time.zone.now.to_i)
    update_call!(call, status, duration_seconds: duration, end_reason: payload[:terminate_reason], meta: meta)
    broadcast(call, 'voice_call.ended', status: call.display_status, duration_seconds: call.duration_seconds)
  end

  # No connect was ever processed (webhook reordering or never delivered) — build a
  # bare Call+Message for the contact so the UI shows the missed-call bubble.
  def build_missed_inbound_call(payload)
    Voice::InboundCallBuilder.perform!(
      inbox: inbox, from_number: "+#{payload[:from]}", call_sid: payload[:id],
      provider: :whatsapp,
      extra_meta: { 'ice_servers' => Call.default_ice_servers }
    )
  rescue ActiveRecord::RecordNotUnique
    Call.whatsapp.find_by(provider_call_id: payload[:id])
  end

  # accepted_by_agent_id is the initiating agent on outbound calls, so it only signals "answered" for inbound.
  def answered?(call, duration)
    call.in_progress? || duration.to_i.positive? || (call.incoming? && call.accepted_by_agent_id.present?)
  end

  def update_call!(call, status, **attrs)
    call.update!(status: status, **attrs)
    Voice::CallMessageBuilder.new(call).update_status!(status: status, agent: call.accepted_by_agent,
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

  # Ring the assignee if assigned; otherwise account-wide so any agent can pick up.
  def broadcast_incoming(call, sdp_offer)
    contact = call.contact
    token = call.conversation.assignee&.pubsub_token
    broadcast(call, 'voice_call.incoming',
              streams: token ? [token] : account_streams,
              direction: call.direction_label, inbox_id: call.inbox_id,
              sdp_offer: sdp_offer, ice_servers: Call.default_ice_servers,
              caller: { name: contact.name, phone: contact.phone_number, avatar: contact.avatar_url })
  end

  def broadcast(call, event, streams: account_streams, **extra)
    payload = { event: event, data: base_payload(call).merge(extra) }
    streams.each { |s| ActionCable.server.broadcast(s, payload) }
  end

  def account_streams
    ["account_#{inbox.account_id}"]
  end

  def base_payload(call)
    { account_id: inbox.account_id, id: call.id, call_id: call.provider_call_id,
      provider: 'whatsapp', conversation_id: call.conversation_id }
  end
end
