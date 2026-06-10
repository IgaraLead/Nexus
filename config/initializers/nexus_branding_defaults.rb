# frozen_string_literal: true

require 'digest'

Rails.application.config.to_prepare do
  next if Rails.env.test?
  next unless defined?(InstallationConfig)

  begin
    next unless InstallationConfig.table_exists?
  rescue ActiveRecord::NoDatabaseError, ActiveRecord::ConnectionNotEstablished,
         PG::ConnectionBad
    next
  end

  brand_asset_url = lambda do |path|
    digest = Digest::SHA256.file(Rails.root.join('public', path.delete_prefix('/'))).hexdigest[0, 12]

    "#{path}?v=#{digest}"
  rescue Errno::ENOENT
    path
  end

  target_values = {
    'INSTALLATION_NAME' => 'Nexus',
    'BRAND_NAME' => 'Nexus',
    'LOGO' => brand_asset_url.call('/brand-assets/logo.svg'),
    'LOGO_DARK' => brand_asset_url.call('/brand-assets/logo_dark.svg'),
    'LOGO_THUMBNAIL' => brand_asset_url.call('/brand-assets/logo_thumbnail.svg'),
    'LOGO_THUMBNAIL_DARK' => brand_asset_url.call('/brand-assets/logo_thumbnail_dark.svg')
  }

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
