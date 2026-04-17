class Voice::Provider::Twilio::ConferenceService
  pattr_initialize [:call!, { twilio_client: nil }]

  def ensure_conference_sid
    return call.conference_sid if call.conference_sid.present?

    call.update!(conference_sid: Voice::Conference::Name.for(call))
    call.conference_sid
  end

  def mark_agent_joined(user:)
    call.update!(accepted_by_agent: user)
  end

  def end_conference
    return if call.conference_sid.blank?

    twilio_client
      .conferences
      .list(friendly_name: call.conference_sid, status: 'in-progress')
      .each { |conf| twilio_client.conferences(conf.sid).update(status: 'completed') }
  end

  private

  def twilio_client
    @twilio_client ||= begin
      channel = call.inbox.channel
      if channel.api_key_sid.present? && channel.try(:api_key_secret).present?
        ::Twilio::REST::Client.new(channel.api_key_sid, channel.api_key_secret, channel.account_sid)
      else
        ::Twilio::REST::Client.new(channel.account_sid, channel.auth_token)
      end
    end
  end
end
