# frozen_string_literal: true

class Channel::BaileysWhatsapp < ApplicationRecord
  include Channelable

  self.table_name = 'channel_baileys_whatsapp'

  EDITABLE_ATTRS = [:phone_number, { provider_config: {} }].freeze

  SESSION_STATUSES = %w[disconnected connecting qr_pending connected].freeze

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

  def request_qr_code(force: false, sync_full_history: true, import_groups: false)
    baileys_service.request_qr_code(
      force: force,
      sync_full_history: sync_full_history,
      import_groups: import_groups
    )
  end

  def disconnect_session
    baileys_service.disconnect
    update!(session_status: 'disconnected')
  end

  def mark_connected(phone_number)
    update!(session_status: 'connected', phone_number: phone_number, last_connected_at: Time.current,
            provider_config: provider_config.except('qr_code'))
  end

  def mark_disconnected
    update!(session_status: 'disconnected')
  end

  private

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
