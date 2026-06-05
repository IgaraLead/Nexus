require 'rails_helper'

RSpec.describe Channel::BaileysWhatsapp, type: :model do
  describe '#request_qr_code' do
    it 'does not request a new QR code while a session is connected' do
      channel = create(:channel_baileys_whatsapp, session_status: 'connected')

      expect(channel.baileys_service).not_to receive(:request_qr_code)

      result = channel.request_qr_code

      expect(result['code']).to eq('active_session')
      expect(result['error']).to be_present
    end

    it 'allows QR requests for disconnected sessions' do
      channel = create(:channel_baileys_whatsapp, session_status: 'disconnected')
      response = { 'status' => 'qr_pending' }

      allow(channel.baileys_service).to receive(:request_qr_code).and_return(response)

      expect(channel.request_qr_code).to eq(response)
    end
  end

  describe '#disconnect_session' do
    it 'updates session status without deleting conversation history' do
      channel = create(
        :channel_baileys_whatsapp,
        phone_number: '+5511988887777',
        provider_config: { 'qr_code' => 'stale-qr', 'sync_full_history' => true }
      )
      previous_session_id = channel.session_id
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
      end.not_to(change { inbox.messages.count })

      expect(channel.reload.session_status).to eq('disconnected')
      expect(channel.session_id).to be_present
      expect(channel.session_id).not_to eq(previous_session_id)
      expect(channel.phone_number).to be_nil
      expect(channel.provider_config).to eq('sync_full_history' => true)
      expect(conversation.reload.messages.where(source_id: 'history-preserved')).to exist
    end
  end
end
