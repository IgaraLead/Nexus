# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Baileys::ProviderService do
  let(:channel) { instance_double(Channel::BaileysWhatsapp, session_id: '1_abcd1234') }

  describe '#mark_messages_read' do
    it 'sends Baileys message keys for incoming messages with source ids' do
      contact_inbox = instance_double(ContactInbox, source_id: '5511999999999@s.whatsapp.net')
      conversation = instance_double(Conversation, contact_inbox: contact_inbox)
      message = instance_double(Message, source_id: 'message-id-1', conversation: conversation)
      service = described_class.new(channel: channel)

      expect(service).to receive(:post).with(
        '/messages/read',
        {
          session_id: '1_abcd1234',
          keys: [{ id: 'message-id-1', remoteJid: '5511999999999@s.whatsapp.net', fromMe: false }]
        }
      )

      service.mark_messages_read([message])
    end

    it 'does not call the sidecar when messages do not have source ids' do
      contact_inbox = instance_double(ContactInbox, source_id: '5511999999999@s.whatsapp.net')
      conversation = instance_double(Conversation, contact_inbox: contact_inbox)
      message = instance_double(Message, source_id: nil, conversation: conversation)
      service = described_class.new(channel: channel)

      expect(service).not_to receive(:post)

      service.mark_messages_read([message])
    end
  end

  describe 'sidecar URL normalization' do
    it 'prepends http:// when scheme is missing so Faraday gets a valid path' do
      ClimateControl.modify(BAILEYS_SIDECAR_URL: 'baileys:3500') do
        service = described_class.new(channel: channel)
        expect(service.send(:base_url)).to eq('http://baileys:3500')
      end
    end

    it 'keeps full http URLs unchanged' do
      ClimateControl.modify(BAILEYS_SIDECAR_URL: 'http://baileys:3500') do
        service = described_class.new(channel: channel)
        expect(service.send(:base_url)).to eq('http://baileys:3500')
      end
    end

    it 'returns nil when URL has no host' do
      ClimateControl.modify(BAILEYS_SIDECAR_URL: 'http://') do
        service = described_class.new(channel: channel)
        expect(service.send(:base_url)).to be_nil
      end
    end

    it 'returns nil for non-http(s) schemes' do
      ClimateControl.modify(BAILEYS_SIDECAR_URL: 'ftp://example.com') do
        service = described_class.new(channel: channel)
        expect(service.send(:base_url)).to be_nil
      end
    end
  end
end
