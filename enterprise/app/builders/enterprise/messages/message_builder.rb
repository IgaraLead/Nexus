module Enterprise::Messages::MessageBuilder
  private

  def message_type
    return @message_type if @message_type == 'incoming' && voice_call_inbox? && @params[:content_type] == 'voice_call'

    super
  end

  # Voice-capable channels (Twilio voice, WhatsApp Cloud Calling) all expose
  # `voice_enabled?`; treat any of them as eligible for the incoming voice_call
  # bubble bypass.
  def voice_call_inbox?
    @conversation.inbox.channel.try(:voice_enabled?)
  end
end
