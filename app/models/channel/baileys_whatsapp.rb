# frozen_string_literal: true

class Channel::BaileysWhatsapp < ApplicationRecord
  include Channelable

  self.table_name = 'channel_baileys_whatsapp'

  EDITABLE_ATTRS = [:phone_number, { provider_config: {} }].freeze

  SESSION_STATUSES = %w[disconnected connecting qr_pending connected].freeze
  ACTIVE_SESSION_STATUSES = %w[connecting qr_pending connected].freeze

  validates :session_id, presence: true, uniqueness: true
  validates :session_status, inclusion: { in: SESSION_STATUSES }

  before_validation :generate_session_id, on: :create
  before_destroy :disconnect_baileys_session

  def name
    'BaileysWhatsapp'
  end

  def baileys_service
    @baileys_service ||= Baileys::ProviderService.new(channel: self)
  end

  def send_message(phone_number, message)
    baileys_service.send_message(phone_number, message)
  end

  def mark_messages_read(messages)
    baileys_service.mark_messages_read(messages)
  end

  def request_qr_code(force: false, sync_full_history: true, import_groups: false)
    if active_session?
      return {
        'error' => 'Disconnect the existing WhatsApp Web session before requesting a new QR code.',
        'code' => 'active_session'
      }
    end

    baileys_service.request_qr_code(
      force: force,
      sync_full_history: sync_full_history,
      import_groups: import_groups
    )
  end

  def disconnect_session
    baileys_service.disconnect
    reset_session_state!
  end

  def delete_session
    baileys_service.disconnect
    reset_session_state!
  end

  def mark_connected(phone_number)
    update!(session_status: 'connected', phone_number: phone_number, last_connected_at: Time.current,
            provider_config: provider_config.except('qr_code'))
  end

  def mark_disconnected
    update!(session_status: 'disconnected')
  end

  def active_session?
    session_status.in?(ACTIVE_SESSION_STATUSES)
  end

  def connected_session?
    session_status == 'connected'
  end

  private

  def reset_session_state!
    self.session_id = nil
    generate_session_id
    update!(
      session_id: session_id,
      session_status: 'disconnected',
      phone_number: nil,
      provider_config: provider_config.to_h.except('qr_code')
    )
  end

  def generate_session_id
    return if session_id.present?

    self.session_id = "#{account_id}_#{SecureRandom.hex(8)}"
  end

  def disconnect_baileys_session
    baileys_service.disconnect
  rescue StandardError => e
    Rails.logger.warn("Failed to disconnect Baileys session #{session_id}: #{e.message}")
  end
end
