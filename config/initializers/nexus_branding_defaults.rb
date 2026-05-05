# frozen_string_literal: true

Rails.application.config.to_prepare do
  next unless defined?(InstallationConfig)
  begin
    next unless InstallationConfig.table_exists?
  rescue ActiveRecord::NoDatabaseError, ActiveRecord::ConnectionNotEstablished,
         PG::ConnectionBad
    next
  end

  target_values = {
    'INSTALLATION_NAME' => 'Nexus',
    'BRAND_NAME' => 'Nexus'
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
