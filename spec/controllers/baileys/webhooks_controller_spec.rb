# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Baileys::WebhooksController, type: :request do
  describe 'POST /webhooks/baileys/message' do
    let(:channel) { create(:channel_baileys_whatsapp) }

    it 'returns unauthorized without api key' do
      post '/webhooks/baileys/message',
           params: { session_id: channel.session_id, content: 'hi', key: { id: 'abc', remoteJid: '5511999999999@s.whatsapp.net' } },
           as: :json
      expect(response).to have_http_status(:unauthorized)
    end

    it 'returns unauthorized with wrong api key' do
      with_modified_env BAILEYS_SIDECAR_API_KEY: 'secret' do
        post '/webhooks/baileys/message',
             headers: { 'X-Api-Key' => 'wrong' },
             params: { session_id: channel.session_id, content: 'hi', key: { id: 'abc', remoteJid: '5511999999999@s.whatsapp.net' } },
             as: :json
        expect(response).to have_http_status(:unauthorized)
      end
    end

    it 'accepts message with valid api key' do
      with_modified_env BAILEYS_SIDECAR_API_KEY: 'secret' do
        post '/webhooks/baileys/message',
             headers: { 'X-Api-Key' => 'secret' },
             params: {
               session_id: channel.session_id,
               content: 'hello',
               key: { id: 'msgid1', remoteJid: '5511999999999@s.whatsapp.net', fromMe: false }
             },
             as: :json
        expect(response).to have_http_status(:success)
        json = response.parsed_body
        expect(json['status']).to eq('ok')
      end
    end

    it 'skips history messages for missing channels' do
      with_modified_env BAILEYS_SIDECAR_API_KEY: 'secret' do
        post '/webhooks/baileys/message',
             headers: { 'X-Api-Key' => 'secret' },
             params: {
               session_id: '1_orphan',
               content: 'old message',
               is_history: true,
               key: { id: 'msgid1', remoteJid: '5511999999999@s.whatsapp.net', fromMe: false }
             },
             as: :json

        expect(response).to have_http_status(:success)
        expect(response.parsed_body).to eq({ 'status' => 'skipped', 'reason' => 'channel_not_found' })
      end
    end

    it 'returns not found for realtime messages from missing channels' do
      with_modified_env BAILEYS_SIDECAR_API_KEY: 'secret' do
        post '/webhooks/baileys/message',
             headers: { 'X-Api-Key' => 'secret' },
             params: {
               session_id: '1_orphan',
               content: 'new message',
               key: { id: 'msgid1', remoteJid: '5511999999999@s.whatsapp.net', fromMe: false }
             },
             as: :json

        expect(response).to have_http_status(:not_found)
      end
    end
  end
end
