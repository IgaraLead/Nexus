# frozen_string_literal: true

class SuperAdmin::WhatsappController < SuperAdmin::ApplicationController
  CLOUD_API_CONFIGS = %w[WHATSAPP_APP_ID WHATSAPP_APP_SECRET WHATSAPP_CONFIGURATION_ID WHATSAPP_API_VERSION].freeze
  VALID_TABS = %w[cloud_api whatsapp_web].freeze
  SESSION_ID_PATTERN = /\A[a-zA-Z0-9_-]{1,128}\z/
  CLIENT_SLUG_PATTERN = /\A[a-z0-9][a-z0-9-]{0,62}\z/

  def show
    load_page
  end

  def create
    errors = save_cloud_api_configs

    if errors.any?
      redirect_to super_admin_whatsapp_path(tab: 'cloud_api'), alert: errors.join(', ')
    else
      redirect_to super_admin_whatsapp_path(tab: 'cloud_api'), notice: I18n.t('super_admin.whatsapp.cloud_api_updated')
    end
  end

  def revoke_session
    channel = Channel::BaileysWhatsapp.find(params[:channel_id])
    revoked_session_id = channel.session_id
    channel.disconnect_session
    log_super_admin_action("revoked channel #{channel.id} session #{revoked_session_id}")

    redirect_to super_admin_whatsapp_path(tab: 'whatsapp_web'),
                notice: I18n.t('super_admin.whatsapp.session_revoked', session_id: revoked_session_id)
  end

  def delete_session
    channel = Channel::BaileysWhatsapp.find(params[:channel_id])
    deleted_session_id = channel.session_id
    channel.delete_session
    orphan_count = disconnect_sidecar_sessions_by_id(deleted_session_id)
    log_super_admin_action(
      "deleted channel #{channel.id} session #{deleted_session_id} and #{orphan_count} matching orphan sessions"
    )

    redirect_to super_admin_whatsapp_path(tab: 'whatsapp_web'),
                notice: I18n.t('super_admin.whatsapp.session_deleted', session_id: deleted_session_id)
  end

  def revoke_account_sessions
    account = Account.find(params[:account_id])
    channels = account.baileys_whatsapp_channels.to_a
    channels.each(&:disconnect_session)
    orphan_count = disconnect_orphan_sessions_for_account(account)
    log_super_admin_action("revoked #{channels.size} channel sessions and #{orphan_count} orphan sessions for account #{account.id}")

    redirect_to super_admin_whatsapp_path(tab: 'whatsapp_web'),
                notice: I18n.t('super_admin.whatsapp.account_sessions_revoked',
                               account: account.name, count: channels.size + orphan_count)
  end

  def delete_account_sessions
    account = Account.find(params[:account_id])
    channels = account.baileys_whatsapp_channels.to_a
    channels.each(&:delete_session)
    orphan_count = disconnect_orphan_sessions_for_account(account)
    log_super_admin_action("deleted #{channels.size} channel sessions and #{orphan_count} orphan sessions for account #{account.id}")

    redirect_to super_admin_whatsapp_path(tab: 'whatsapp_web'),
                notice: I18n.t('super_admin.whatsapp.account_sessions_deleted',
                               account: account.name, count: channels.size + orphan_count)
  end

  def revoke_orphan_session
    session_id = params[:session_id].to_s
    client_slug = params[:client_slug].presence
    unless valid_session_params?(session_id, client_slug)
      return redirect_to super_admin_whatsapp_path(tab: 'whatsapp_web'),
                         alert: I18n.t('super_admin.whatsapp.invalid_session')
    end

    response = sidecar_service.disconnect(session_id: session_id, client_slug: client_slug)
    return redirect_to super_admin_whatsapp_path(tab: 'whatsapp_web'), alert: response['error'] if response['error'].present?

    log_super_admin_action("revoked orphan session #{session_id}")
    redirect_to super_admin_whatsapp_path(tab: 'whatsapp_web'),
                notice: I18n.t('super_admin.whatsapp.session_revoked', session_id: session_id)
  end

  def delete_orphan_session
    session_id = params[:session_id].to_s
    client_slug = params[:client_slug].presence
    unless valid_session_params?(session_id, client_slug)
      return redirect_to super_admin_whatsapp_path(tab: 'whatsapp_web'),
                         alert: I18n.t('super_admin.whatsapp.invalid_session')
    end

    response = sidecar_service.disconnect(session_id: session_id, client_slug: client_slug)
    return redirect_to super_admin_whatsapp_path(tab: 'whatsapp_web'), alert: response['error'] if response['error'].present?

    log_super_admin_action("deleted orphan session #{session_id}")
    redirect_to super_admin_whatsapp_path(tab: 'whatsapp_web'),
                notice: I18n.t('super_admin.whatsapp.session_deleted', session_id: session_id)
  end

  private

  def load_page
    @active_tab = params[:tab].presence_in(VALID_TABS) || 'cloud_api'
    load_cloud_api_configs
    load_whatsapp_web_sessions
  end

  def load_cloud_api_configs
    @cloud_api_config_keys = CLOUD_API_CONFIGS
    @app_config = InstallationConfig.where(name: CLOUD_API_CONFIGS)
                                    .pluck(:name, :serialized_value)
                                    .to_h
                                    .transform_values { |serialized_value| serialized_value['value'] }
    @installation_configs = ConfigLoader.new.general_configs.index_by { |config| config['name'] }
  end

  def load_whatsapp_web_sessions
    @sidecar_error = nil
    result = sidecar_service.sessions
    @sidecar_sessions = result[:sessions]
    @sidecar_error = result[:error]
    @sidecar_sessions_by_key = @sidecar_sessions.index_by { |session| sidecar_session_key(session) }

    channels = Channel::BaileysWhatsapp.includes(:account, :inbox).order(:account_id, :id)
    @whatsapp_web_rows = channels.map { |channel| whatsapp_web_row(channel) }
    @whatsapp_web_rows_by_account = @whatsapp_web_rows.group_by { |row| row[:account] }
    matched_sidecar_keys = @whatsapp_web_rows.filter_map { |row| row[:sidecar_session_key] }.to_set
    @orphan_sidecar_sessions = @sidecar_sessions.reject { |session| matched_sidecar_keys.include?(sidecar_session_key(session)) }
  end

  def whatsapp_web_row(channel)
    {
      account: channel.account,
      inbox: channel.inbox,
      channel: channel,
      sidecar_session_key: channel.session_id,
      sidecar_session: @sidecar_sessions_by_key[channel.session_id]
    }
  end

  def sidecar_session_key(session)
    client_slug = sidecar_client_slug(session)
    session_id = sidecar_session_id(session)

    client_slug.present? ? "#{client_slug}:#{session_id}" : session_id
  end

  def save_cloud_api_configs
    submitted = params[:app_config]&.permit(*CLOUD_API_CONFIGS).to_h
    CLOUD_API_CONFIGS.each_with_object([]) do |key, errors|
      next unless submitted.key?(key)

      config = InstallationConfig.where(name: key).first_or_create(value: submitted[key], locked: false)
      config.value = submitted[key]
      errors.concat(config.errors.full_messages) unless config.save
    end
  end

  def disconnect_orphan_sessions_for_account(account)
    prefix = "#{account.id}_"
    current_session_ids = account.baileys_whatsapp_channels.pluck(:session_id).to_set
    orphan_sessions = sidecar_service.sessions[:sessions].select do |session|
      session_id = sidecar_session_id(session)
      session_id.start_with?(prefix) && current_session_ids.exclude?(session_id)
    end

    orphan_sessions.count do |session|
      disconnect_sidecar_session(session)
    end
  end

  def disconnect_sidecar_sessions_by_id(session_id)
    sidecar_service.sessions[:sessions].select { |session| sidecar_session_id(session) == session_id }.count do |session|
      disconnect_sidecar_session(session)
    end
  end

  def disconnect_sidecar_session(session)
    response = sidecar_service.disconnect(session_id: sidecar_session_id(session), client_slug: sidecar_client_slug(session))
    response['error'].blank?
  end

  def sidecar_session_id(session)
    (session['session_id'] || session[:session_id]).to_s
  end

  def sidecar_client_slug(session)
    (session['client_slug'] || session[:client_slug]).presence
  end

  def valid_session_params?(session_id, client_slug)
    session_id.match?(SESSION_ID_PATTERN) && (client_slug.blank? || client_slug.match?(CLIENT_SLUG_PATTERN))
  end

  def sidecar_service
    @sidecar_service ||= Baileys::SidecarAdminService.new
  end

  def log_super_admin_action(message)
    Rails.logger.info(
      "[SuperAdmin] whatsapp #{message} " \
      "(actor_id=#{current_super_admin&.id}, actor_email=#{current_super_admin&.email})"
    )
  end
end
