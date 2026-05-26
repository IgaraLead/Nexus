# frozen_string_literal: true

class Baileys::ReadReceiptService
  pattr_initialize [:conversation!, :last_seen_at!, :update_assignee!]

  def perform
    return unless channel.is_a?(Channel::BaileysWhatsapp)

    messages = unread_messages.incoming.where.not(source_id: [nil, '']).where('messages.created_at <= ?', last_seen_at)
    return if messages.blank?

    channel.mark_messages_read(messages)
  rescue StandardError => e
    Rails.logger.warn("[BaileysReadReceipt] Failed to mark messages read for conversation=#{conversation.id}: #{e.message}")
  end

  private

  def channel
    @channel ||= conversation.inbox.channel
  end

  def unread_messages
    update_assignee ? conversation.assignee_unread_messages : conversation.unread_messages
  end
end
