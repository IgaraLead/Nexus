# frozen_string_literal: true

class Baileys::SendOnBaileysService < Base::SendOnChannelService
  private

  def channel_class
    Channel::BaileysWhatsapp
  end

  def perform_reply
    unless channel.connected_session?
      Messages::StatusUpdateService.new(message, 'failed', I18n.t('errors.baileys_whatsapp.disconnected')).perform
      return
    end

    message_id = channel.send_message(message.conversation.contact_inbox.source_id, message)
    message.update!(source_id: message_id, status: :sent) if message_id.present?
  end
end
