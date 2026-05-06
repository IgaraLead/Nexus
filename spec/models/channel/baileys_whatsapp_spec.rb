require 'rails_helper'

RSpec.describe Channel::BaileysWhatsapp, type: :model do
  describe '#disconnect_session' do
    it 'updates session status without deleting conversation history' do
      channel = create(:channel_baileys_whatsapp)
      inbox = channel.inbox
      contact = create(:contact, account: inbox.account, phone_number: '+5511999999999')
      contact_inbox = create(
        :contact_inbox,
        inbox: inbox,
        contact: contact,
        source_id: '5511999999999@s.whatsapp.net'
      )
      conversation = create(
        :conversation,
        inbox: inbox,
        account: inbox.account,
        contact: contact,
        contact_inbox: contact_inbox
      )
      create(
        :message,
        account: inbox.account,
        inbox: inbox,
        conversation: conversation,
        source_id: 'history-preserved',
        content: 'existing history'
      )

      allow(channel.baileys_service).to receive(:disconnect).and_return({})

      expect do
        channel.disconnect_session
      end.not_to change { inbox.messages.count }

      expect(channel.reload.session_status).to eq('disconnected')
      expect(conversation.reload.messages.where(source_id: 'history-preserved')).to exist
    end
  end
end
