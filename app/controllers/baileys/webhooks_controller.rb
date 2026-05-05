# frozen_string_literal: true

class Baileys::WebhooksController < ApplicationController
  DEFAULT_SIDECAR_API_KEY = 'nexus-internal-baileys'

  skip_before_action :verify_authenticity_token, raise: false
  skip_before_action :authenticate_user!, raise: false
  before_action :authenticate_sidecar!

  def message
    channel = find_channel
    return render json: { error: 'Channel not found' }, status: :not_found unless channel

    Baileys::IncomingMessageService.new(inbox: channel.inbox, params: baileys_params).perform
    render json: { status: 'ok' }
  rescue ActiveRecord::RecordInvalid => e
    Rails.logger.warn("[BaileysWebhook] Message processing failed: #{e.message}")
    render json: { status: 'skipped', reason: e.message }
  rescue StandardError => e
    Rails.logger.error("[BaileysWebhook] Unexpected message processing error: #{e.class} #{e.message}")
    render json: { status: 'skipped', reason: 'unexpected error' }
  end

  def status_update
    channel = find_channel
    return render json: { error: 'Channel not found' }, status: :not_found unless channel

    handle_status_update(channel)
    render json: { status: 'ok' }
  end

  def qr_code
    channel = find_channel
    return render json: { error: 'Channel not found' }, status: :not_found unless channel

    channel.update!(session_status: 'qr_pending', provider_config: channel.provider_config.merge('qr_code' => params[:qr]))
    render json: { status: 'ok' }
  rescue ActiveRecord::RecordInvalid => e
    Rails.logger.warn("[BaileysWebhook] qr_code update failed: #{e.message}")
    render json: { error: e.record.errors.full_messages.join(', ') }, status: :unprocessable_entity
  end

  def connection_update
    channel = find_channel
    return render json: { error: 'Channel not found' }, status: :not_found unless channel

    handle_connection_update(channel)
    render json: { status: 'ok' }
  end

  def contact_update
    channel = find_channel
    return render json: { error: 'Channel not found' }, status: :not_found unless channel

    handle_contact_update(channel)
    render json: { status: 'ok' }
  end

  def group_update
    channel = find_channel
    return render json: { error: 'Channel not found' }, status: :not_found unless channel

    handle_group_update(channel)
    render json: { status: 'ok' }
  end

  private

  def authenticate_sidecar!
    api_key = request.headers['X-Api-Key'].to_s
    expected = ENV.fetch('BAILEYS_SIDECAR_API_KEY', DEFAULT_SIDECAR_API_KEY).to_s
    ok = expected.present? &&
         api_key.bytesize == expected.bytesize &&
         ActiveSupport::SecurityUtils.secure_compare(api_key, expected)

    return if ok

    render json: { error: 'Unauthorized' }, status: :unauthorized
  end

  def find_channel
    Channel::BaileysWhatsapp.find_by(session_id: params[:session_id])
  end

  def baileys_params
    params.permit!.to_h.deep_symbolize_keys
  end

  # rubocop:disable Metrics/CyclomaticComplexity
  def handle_status_update(channel)
    source_id = params.dig(:key, :id)
    return if source_id.blank?

    status = params[:status]
    return unless %w[sent delivered read failed].include?(status)

    message = channel.inbox.messages.find_by(source_id: source_id)
    unless message
      Rails.logger.debug { "[BaileysWebhook] Status update: message not found for source_id=#{source_id}" }
      return
    end

    status_order = { 'sent' => 0, 'delivered' => 1, 'read' => 2, 'failed' => 3 }
    current_rank = status_order[message.status] || -1
    new_rank = status_order[status] || -1
    return if new_rank <= current_rank && status != 'failed'

    message.update!(status: status)
  end
  # rubocop:enable Metrics/CyclomaticComplexity

  def handle_connection_update(channel)
    case params[:connection]
    when 'open'
      phone = params[:phone_number] || channel.phone_number
      channel.mark_connected(phone)
    when 'close'
      channel.mark_disconnected
    end
  end

  def handle_contact_update(channel)
    phone_number = params[:phone_number]
    return if phone_number.blank?

    name = params[:name].presence || params[:notify].presence
    waid = phone_number.to_s.gsub(/[^\d]/, '')
    contact = Contact.find_by(phone_number: "+#{waid}", account_id: channel.account_id)
    return unless contact

    contact.update!(name: name) if name.present? && contact.name.start_with?('+')

    update_contact_avatar(contact, params[:avatar_url])
  end

  def handle_group_update(channel)
    jid = params[:jid]
    return if jid.blank?

    name = params[:name].presence
    return if name.blank?

    contact_inbox = channel.inbox.contact_inboxes.find_by(source_id: jid)
    return unless contact_inbox

    contact = contact_inbox.contact
    contact.update!(name: name) if contact.name.start_with?('Group ')
    update_contact_avatar(contact, params[:avatar_url])
  end

  def update_contact_avatar(contact, avatar_url)
    return if avatar_url.blank?
    return if contact.avatar.attached?

    ::Avatar::AvatarFromUrlJob.perform_later(contact, avatar_url)
  end
end
