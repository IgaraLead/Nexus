# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Baileys::ProviderService do
  let(:channel) { instance_double(Channel::BaileysWhatsapp, session_id: '1_abcd1234') }

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
