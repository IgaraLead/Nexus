require 'rails_helper'

describe Baileys::IncomingMessageService do
  describe '#perform' do
    let!(:channel) { create(:channel_baileys_whatsapp) }
    let(:inbox) { channel.inbox }

    it 'deduplicates by inbox and source_id' do
      other_channel = create(:channel_baileys_whatsapp, account: inbox.account)
      other_inbox = other_channel.inbox
      other_contact_inbox = create(
        :contact_inbox,
        inbox: other_inbox,
        contact: create(:contact, account: inbox.account),
        source_id: '5511999999999@s.whatsapp.net'
      )
      other_conversation = create(
        :conversation,
        inbox: other_inbox,
        account: inbox.account,
        contact: other_contact_inbox.contact,
        contact_inbox: other_contact_inbox
      )
      create(
        :message,
        account: inbox.account,
        inbox: other_inbox,
        conversation: other_conversation,
        source_id: 'duplicate-message-id',
        content: 'existing on other inbox'
      )

      params = {
        key: {
          id: 'duplicate-message-id',
          remoteJid: '5511999999999@s.whatsapp.net',
          fromMe: false
        },
        content: 'new message on current inbox',
        message_type: 'conversation'
      }

      expect do
        described_class.new(inbox: inbox, params: params).perform
      end.to change { inbox.messages.count }.by(1)
    end

    it 'uses text field fallback when content is blank' do
      params = {
        key: {
          id: 'text-fallback-id',
          remoteJid: '551188887777@s.whatsapp.net',
          fromMe: false
        },
        message: {
          text: 'plain text from baileys payload'
        },
        message_type: 'conversation'
      }

      described_class.new(inbox: inbox, params: params).perform

      message = inbox.messages.find_by(source_id: 'text-fallback-id')
      expect(message).to be_present
      expect(message.content).to eq('plain text from baileys payload')
    end
  end
end
