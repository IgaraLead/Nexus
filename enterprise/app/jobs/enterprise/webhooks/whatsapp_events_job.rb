module Enterprise::Webhooks::WhatsappEventsJob
  def handle_message_events(channel, params)
    return handle_call_events(channel, params) if call_event?(params)
    return handle_call_permission_reply(channel, params) if call_permission_reply?(params)

    super
  end

  private

  # Call webhooks don't share the message-mutex sender_id; we lock per-call_id
  # inside `handle_call_events` instead so multi-call batches don't share a
  # single lock keyed on the first call's id.
  def contact_sender_id(params)
    return nil if call_event?(params)

    super
  end

  def call_event?(params)
    params.dig(:entry, 0, :changes, 0, :field) == 'calls'
  end

  def call_permission_reply?(params)
    message = params.dig(:entry, 0, :changes, 0, :value, :messages, 0)
    message&.dig(:type) == 'interactive' && message&.dig(:interactive, :type) == 'call_permission_reply'
  end

  # Acquire a per-call_id mutex around each call payload so that connect /
  # terminate webhooks for the same call are serialized — even when Meta
  # batches multiple calls in one webhook envelope.
  def handle_call_events(channel, params)
    calls = params.dig(:entry, 0, :changes, 0, :value, :calls) || []
    calls.each do |call_payload|
      lock_key = format(::Redis::Alfred::WHATSAPP_MESSAGE_MUTEX,
                        inbox_id: channel.inbox.id, sender_id: "call:#{call_payload[:id]}")
      with_lock(lock_key, 30.seconds) do
        Whatsapp::IncomingCallService.new(inbox: channel.inbox, params: { calls: [call_payload] }).perform
      end
    end
  end

  def handle_call_permission_reply(channel, params)
    Whatsapp::CallPermissionReplyService.new(inbox: channel.inbox, params: params).perform
  end
end
