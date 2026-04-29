class Onboarding::WebWidgetCreationService
  DEFAULT_WIDGET_COLOR = '#1f93ff'.freeze

  def initialize(account, user)
    @account = account
    @user = user
  end

  def perform
    if website_url.blank?
      Rails.logger.info "[WidgetCreation] Skipping for account #{@account.id}: no website_url available"
      return nil
    end

    ActiveRecord::Base.transaction do
      channel = build_channel
      inbox = @account.inboxes.create!(name: @account.name, channel: channel)
      InboxMember.find_or_create_by!(inbox: inbox, user: @user)
      inbox
    end
  rescue StandardError => e
    Rails.logger.error "[WidgetCreation] #{e.message}"
    nil
  end

  private

  def build_channel
    @account.web_widgets.create!(
      website_url: website_url,
      widget_color: widget_color,
      welcome_title: welcome_title,
      welcome_tagline: welcome_tagline_text
    )
  end

  def brand_info
    @brand_info ||= (@account.custom_attributes['brand_info'] || {}).deep_symbolize_keys
  end

  def website_url
    @account.domain.presence || brand_info[:domain].presence
  end

  def widget_color
    hex = brand_info[:colors]&.first&.dig(:hex)
    hex.to_s.match?(/\A#\h{6}\z/) ? hex : DEFAULT_WIDGET_COLOR
  end

  def welcome_title
    brand_info[:title].presence || @account.name
  end

  def welcome_tagline_text
    brand_info[:slogan].presence || brand_info[:description].presence
  end
end

Onboarding::WebWidgetCreationService.prepend_mod_with('Onboarding::WebWidgetCreationService')
