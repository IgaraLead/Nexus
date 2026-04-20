class Voice::CallMessageBuilder
  def self.perform!(call:)
    new(call: call).perform!
  end

  def initialize(call:)
    @call = call
  end

  def perform!
    find_message || create_message!
  end

  private

  attr_reader :call

  def find_message
    return call.message if call.message_id.present?

    call.conversation.messages.voice_calls
        .find_by("content_attributes -> 'data' ->> 'call_sid' = ?", call.provider_call_id)
  end

  def create_message!
    params = {
      content: 'Voice Call',
      message_type: call.outgoing? ? 'outgoing' : 'incoming',
      content_type: 'voice_call',
      content_attributes: { 'data' => { 'call_sid' => call.provider_call_id } }
    }
    Messages::MessageBuilder.new(sender, call.conversation, params).perform
  end

  def sender
    call.outgoing? ? call.accepted_by_agent : call.contact
  end
end
