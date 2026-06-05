require 'rails_helper'

RSpec.describe Baileys::SendOnBaileysService do
  describe '#perform' do
    let(:channel) { create(:channel_baileys_whatsapp, session_status: session_status) }
    let(:contact) { create(:contact, account: channel.account, phone_number: '+5511999999999') }
    let(:contact_inbox) do
      create(:contact_inbox, inbox: channel.inbox, contact: contact, source_id: '5511999999999@s.whatsapp.net')
    end
    let(:conversation) do
      create(:conversation, account: channel.account, inbox: channel.inbox, contact: contact, contact_inbox: contact_inbox)
    end
    let(:message) do
      create(:message, account: channel.account, inbox: channel.inbox, conversation: conversation, content: 'hello', message_type: :outgoing)
    end
    let(:provider_service) { instance_double(Baileys::ProviderService) }

    before do
      allow(Baileys::ProviderService).to receive(:new).and_return(provider_service)
    end

    context 'when the session is disconnected' do
      let(:session_status) { 'disconnected' }

      it 'marks the message as failed without calling the sidecar' do
        expect(provider_service).not_to receive(:send_message)

        described_class.new(message: message).perform

        expect(message.reload.status).to eq('failed')
        expect(message.external_error).to eq(I18n.t('errors.baileys_whatsapp.disconnected'))
      end
    end

    context 'when the session is connected' do
      let(:session_status) { 'connected' }

      it 'sends the message through the channel' do
        allow(provider_service).to receive(:send_message).and_return('baileys-message-id')

        described_class.new(message: message).perform

        expect(message.reload.source_id).to eq('baileys-message-id')
        expect(message.status).to eq('sent')
      end
    end
  end
end
