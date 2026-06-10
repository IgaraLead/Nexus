# frozen_string_literal: true

require 'digest'

module NexusBrandingDefaults
  module_function

  def apply
    return if Rails.env.test?
    return unless installation_config_available?

    has_updates = false
    target_values.each do |name, value|
      config = InstallationConfig.find_or_initialize_by(name: name)
      next if config.value == value

      config.value = value
      config.locked = true if config.locked.nil?
      config.save!
      has_updates = true
    end
    GlobalConfig.clear_cache if has_updates
  end

  def installation_config_available?
    defined?(InstallationConfig) && InstallationConfig.table_exists?
  rescue ActiveRecord::NoDatabaseError, ActiveRecord::ConnectionNotEstablished,
         PG::ConnectionBad
    false
  end

  def target_values
    {
      'INSTALLATION_NAME' => 'Nexus',
      'BRAND_NAME' => 'Nexus',
      'LOGO' => brand_asset_url('/brand-assets/logo.svg'),
      'LOGO_DARK' => brand_asset_url('/brand-assets/logo_dark.svg'),
      'LOGO_THUMBNAIL' => brand_asset_url('/brand-assets/logo_thumbnail.svg'),
      'LOGO_THUMBNAIL_DARK' => brand_asset_url('/brand-assets/logo_thumbnail_dark.svg')
    }
  end

  def brand_asset_url(path)
    digest = Digest::SHA256.file(Rails.public_path.join(path.delete_prefix('/'))).hexdigest[0, 12]

    "#{path}?v=#{digest}"
  rescue Errno::ENOENT
    path
  end
end

Rails.application.config.to_prepare { NexusBrandingDefaults.apply }
