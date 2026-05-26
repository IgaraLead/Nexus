# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Baileys::ReadReceiptService do
  let(:account) { create(:account) }
  let(:channel) { create(:channel_baileys_whatsapp, account: account) }
  let(:inbox) { channel.inbox }
  let(:contact) { create(:contact, account: account, phone_number: '+5511999999999') }
  let(:contact_inbox) { create(:contact_inbox, inbox: inbox, contact: contact, source_id: '5511999999999@s.whatsapp.net') }
  let(:conversation) do
    create(
      :conversation,
      account: account,
      inbox: inbox,
      contact: contact,
      contact_inbox: contact_inbox,
      agent_last_seen_at: 30.minutes.ago
    )
  end

  describe '#perform' do
    it 'marks unread incoming Baileys messages as read' do
      message = create(
        :message,
        account: account,
        inbox: inbox,
        conversation: conversation,
        message_type: :incoming,
        source_id: 'message-id-1',
        created_at: 5.minutes.ago
      )
      allow(conversation.inbox).to receive(:channel).and_return(channel)

      expect(channel).to receive(:mark_messages_read) do |messages|
        expect(messages.map(&:source_id)).to contain_exactly(message.source_id)
      end

      described_class.new(conversation: conversation, last_seen_at: DateTime.now.utc, update_assignee: false).perform
    end

    it 'skips non-Baileys channels' do
      other_conversation = create(:conversation, account: account, agent_last_seen_at: 30.minutes.ago)
      create(:message, account: account, conversation: other_conversation, message_type: :incoming, source_id: 'message-id-1')

      expect do
        described_class.new(conversation: other_conversation, last_seen_at: DateTime.now.utc, update_assignee: false).perform
      end.not_to raise_error
    end
  end
end
