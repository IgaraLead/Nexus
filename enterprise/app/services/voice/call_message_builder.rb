class Voice::CallMessageBuilder
  def self.perform!(call:)
    new(call: call).perform!
  end

  def initialize(call:)
    @call = call
  end

  def perform!
    message = find_message
    message ? update_message!(message) : create_message!
  end

  private

  attr_reader :call

  def find_message
    call.conversation.messages.voice_calls.find do |m|
      m.content_attributes.dig('data', 'call_sid') == call.provider_call_id
    end
  end

  def update_message!(message)
    existing = message.content_attributes.fetch('data', {})
    message.update!(content_attributes: { 'data' => data_payload(existing) })
    message
  end

  def create_message!
    params = {
      content: 'Voice Call',
      message_type: message_type,
      content_type: 'voice_call',
      content_attributes: { 'data' => data_payload({}) }
    }
    Messages::MessageBuilder.new(sender, call.conversation, params).perform
  end

  def data_payload(existing)
    now = Time.zone.now.to_i
    meta = existing.fetch('meta', {})

    {
      'call_sid' => call.provider_call_id,
      'status' => call.status.tr('_', '-'),
      'call_direction' => call.display_direction,
      'from_number' => from_number,
      'to_number' => to_number,
      'duration' => call.duration_seconds,
      'recording_url' => existing['recording_url'],
      'transcript' => call.transcript,
      'conference_sid' => call.conference_sid,
      'meta' => {
        'created_at' => meta['created_at'] || now,
        'ringing_at' => meta['ringing_at'] || now
      }
    }
  end

  def from_number
    call.incoming? ? call.contact.phone_number : call.inbox.channel&.phone_number
  end

  def to_number
    call.incoming? ? call.inbox.channel&.phone_number : call.contact.phone_number
  end

  def message_type
    call.outgoing? ? 'outgoing' : 'incoming'
  end

  def sender
    call.outgoing? ? call.accepted_by_agent : call.contact
  end
end
