class Whatsapp::CallPermissionReplyService
  pattr_initialize [:inbox!, :params!]

  def perform
    return unless inbox.channel.voice_enabled?

    reply_data = extract_reply_data
    return unless reply_data&.dig(:accepted)

    contact = find_contact(reply_data[:from_number])
    return unless contact

    conversation = find_active_conversation(contact)
    return unless conversation

    clear_permission_flag(conversation)
    broadcast_permission_granted(contact, conversation)
  end

  private

  def extract_reply_data
    message = params.dig(:entry, 0, :changes, 0, :value, :messages, 0)
    reply = message&.dig(:interactive, :call_permission_reply)
    return unless reply

    accepted = reply[:response] == 'accept'
    Rails.logger.info "[WHATSAPP CALL] call_permission_reply from=#{message[:from]} accepted=#{accepted} permanent=#{reply[:is_permanent]}"
    { from_number: message[:from], accepted: accepted }
  end

  def find_contact(from_number)
    inbox.contact_inboxes.joins(:contact)
         .where(contacts: { phone_number: "+#{from_number}" })
         .first&.contact
  end

  # Pick the conversation that actually requested permission, not just any open
  # one — a contact with multiple open threads in the same inbox would otherwise
  # have the wrong conversation cleared and broadcast.
  def find_active_conversation(contact)
    inbox.conversations
         .where(contact: contact)
         .where.not(status: :resolved)
         .where("additional_attributes ->> 'call_permission_requested_at' IS NOT NULL")
         .order(:created_at)
         .last
  end

  def clear_permission_flag(conversation)
    attrs = conversation.additional_attributes || {}
    attrs.delete('call_permission_requested_at')
    conversation.update!(additional_attributes: attrs)
  end

  def broadcast_permission_granted(contact, conversation)
    ActionCable.server.broadcast(
      "account_#{inbox.account_id}",
      {
        event: 'voice_call.permission_granted',
        data: {
          account_id: inbox.account_id, conversation_id: conversation.id,
          contact_name: contact.name, contact_phone: contact.phone_number
        }
      }
    )
  end
end
