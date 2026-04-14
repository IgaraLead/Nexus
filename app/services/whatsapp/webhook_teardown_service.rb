class Whatsapp::WebhookTeardownService
  def initialize(channel)
    @channel = channel
  end

  def perform
    return unless should_teardown_webhook?

    access_token = provider_config['api_key']
    api_client = Whatsapp::FacebookApiClient.new(access_token)

    # Each clear is isolated so a failure on the phone-level clear
    # still allows the legacy WABA-level fallback to run, and vice versa.
    clear_phone_number_override(api_client)
    clear_legacy_waba_override(api_client)
  rescue StandardError => e
    # Outer safety net: channel deletion runs this via before_destroy, and
    # any unexpected error (including precondition helpers hitting a nil or
    # malformed provider_config) must not block the delete.
    Rails.logger.error "[WHATSAPP] Webhook teardown failed for channel #{@channel&.id}: #{e.message}"
  end

  private

  def provider_config
    @channel.provider_config || {}
  end

  def should_teardown_webhook?
    whatsapp_cloud_provider? && embedded_signup_source? && webhook_config_present?
  end

  def whatsapp_cloud_provider?
    @channel.provider == 'whatsapp_cloud'
  end

  def embedded_signup_source?
    provider_config['source'] == 'embedded_signup'
  end

  # Accept teardown as long as we have an access token and at least one of the
  # two identifiers the clear APIs target. Legacy channels (and partially
  # reauthorized ones) may have only business_account_id, and we still need to
  # clear any lingering WABA-level override in that case.
  def webhook_config_present?
    return false if provider_config['api_key'].blank?

    provider_config['phone_number_id'].present? ||
      provider_config['business_account_id'].present?
  end

  def clear_phone_number_override(api_client)
    phone_number_id = provider_config['phone_number_id']
    return if phone_number_id.blank?

    api_client.clear_phone_number_callback_override(phone_number_id)
    Rails.logger.info "[WHATSAPP] Phone number webhook override cleared for channel #{@channel.id}"
  rescue StandardError => e
    Rails.logger.error "[WHATSAPP] Phone number webhook override clear failed for channel #{@channel.id}: #{e.message}"
  end

  # Legacy channels (pre phone-number-level override) were configured with a
  # WABA-level override_callback_uri that is SHARED across every phone number
  # on the WABA. To avoid knocking out a sibling inbox's webhooks, only clear
  # the WABA override when its current value matches this channel's own
  # callback URL — i.e. this channel is the one that set it.
  def clear_legacy_waba_override(api_client)
    waba_id = provider_config['business_account_id']
    return if waba_id.blank? || @channel.phone_number.blank?

    return unless waba_override_owned_by_channel?(api_client, waba_id)

    api_client.clear_waba_callback_override(waba_id)
    Rails.logger.info "[WHATSAPP] Legacy WABA webhook override cleared for channel #{@channel.id}"
  rescue StandardError => e
    Rails.logger.error "[WHATSAPP] Legacy WABA webhook override clear failed for channel #{@channel.id}: #{e.message}"
  end

  def waba_override_owned_by_channel?(api_client, waba_id)
    subscribed_apps = api_client.fetch_waba_subscribed_apps(waba_id)
    entries = subscribed_apps.is_a?(Hash) ? Array(subscribed_apps['data']) : []
    current_override = entries.filter_map { |entry| entry['override_callback_uri'] }.find(&:present?)

    return false if current_override.blank?

    current_override == channel_callback_url
  end

  def channel_callback_url
    "#{ENV.fetch('FRONTEND_URL', nil)}/webhooks/whatsapp/#{@channel.phone_number}"
  end
end
