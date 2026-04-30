class Whatsapp::CallService
  pattr_initialize [:call!, :agent!, :sdp_answer]

  def accept
    raise Voice::CallErrors::CallFailed, 'sdp_answer is required' if sdp_answer.blank?

    call.with_lock { transition_to_in_progress! }
    update_message_status('in_progress')
    update_conversation_call_status(call.display_status)
    broadcast(:accepted, accepted_by_agent_id: agent.id)
    call
  end

  def reject
    call.reload
    return call if call.terminal? || call.in_progress?

    invoke_provider(:reject_call)
    finalize_call('failed')
    call
  end

  def terminate
    return call if call.terminal?

    invoke_provider(:terminate_call)
    finalize_call('completed')
    call
  end

  private

  def transition_to_in_progress!
    raise Voice::CallErrors::NotRinging, 'Call is not in ringing state' unless call.ringing?
    raise Voice::CallErrors::AlreadyAccepted, 'Call already accepted by another agent' if call.in_progress?

    forward_answer_to_meta!
    call.update!(status: 'in_progress', accepted_by_agent_id: agent.id, started_at: Time.current,
                 meta: (call.meta || {}).merge('sdp_answer' => sdp_answer))
    claim_conversation_for_agent
  end

  def forward_answer_to_meta!
    svc = call.inbox.channel.provider_service
    raise Voice::CallErrors::CallFailed, 'Meta pre_accept failed' unless svc.pre_accept_call(call.provider_call_id, sdp_answer)
    raise Voice::CallErrors::CallFailed, 'Meta accept failed' unless svc.accept_call(call.provider_call_id, sdp_answer)
  end

  # Take ownership of the conversation if no one holds it; leave assignee alone otherwise (transfer via UI).
  def claim_conversation_for_agent
    call.conversation.update!(assignee: agent) if call.conversation.assignee_id.blank?
  end

  def invoke_provider(method)
    success = call.inbox.channel.provider_service.public_send(method, call.provider_call_id)
    Rails.logger.error "[WHATSAPP CALL] #{method} returned false for #{call.provider_call_id}" unless success
  rescue StandardError => e
    Rails.logger.error "[WHATSAPP CALL] #{method} failed: #{e.message}"
  end

  def finalize_call(status)
    meta = (call.meta || {}).merge('ended_at' => Time.zone.now.to_i)
    call.update!(status: status, meta: meta)
    update_message_status(status)
    update_conversation_call_status(call.display_status)
    broadcast(:ended, status: call.display_status)
  end

  def update_message_status(status)
    Voice::CallMessageBuilder.new(call).update_status!(status: status, agent: agent)
  end

  def update_conversation_call_status(status)
    call.conversation.update!(
      additional_attributes: (call.conversation.additional_attributes || {}).merge('call_status' => status)
    )
  end

  def broadcast(event, **extra)
    payload = {
      event: "voice_call.#{event}",
      data: { id: call.id, call_id: call.provider_call_id, provider: call.provider,
              conversation_id: call.conversation_id, account_id: call.account_id }.merge(extra)
    }
    ActionCable.server.broadcast("account_#{call.account_id}", payload)
  end
end
