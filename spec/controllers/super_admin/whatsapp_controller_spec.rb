require 'rails_helper'

RSpec.describe 'Super Admin WhatsApp', type: :request do
  let(:super_admin) { create(:super_admin) }
  let(:sidecar_service) do
    instance_double(Baileys::SidecarAdminService, sessions: { sessions: [], error: nil }, disconnect: { 'status' => 'disconnected' })
  end

  before do
    allow(Baileys::SidecarAdminService).to receive(:new).and_return(sidecar_service)
  end

  describe 'GET /super_admin/whatsapp' do
    context 'when it is an unauthenticated super admin' do
      it 'returns unauthorized' do
        get '/super_admin/whatsapp'
        expect(response).to have_http_status(:redirect)
      end
    end

    context 'when it is an authenticated super admin' do
      it 'shows the WhatsApp settings tabs and Cloud API values' do
        config = InstallationConfig.find_or_initialize_by(name: 'WHATSAPP_APP_ID')
        config.locked = false
        config.value = 'existing-app-id'
        config.save!

        sign_in(super_admin, scope: :super_admin)
        get '/super_admin/whatsapp'

        expect(response).to have_http_status(:success)
        expect(response.body).to include('Cloud API')
        expect(response.body).to include('WhatsApp Web')
        expect(response.body).to include('existing-app-id')
      end

      it 'shows Rails session data when the sidecar is unavailable without revoking sessions' do
        channel = create(:channel_baileys_whatsapp, session_status: 'connected')
        allow(sidecar_service).to receive(:sessions).and_return(
          { sessions: [], error: 'connection refused' }
        )

        sign_in(super_admin, scope: :super_admin)
        get '/super_admin/whatsapp', params: { tab: 'whatsapp_web' }

        expect(response).to have_http_status(:success)
        expect(response.body).to include('Sidecar status is unavailable')
        expect(response.body).to include(channel.session_id)
        expect(channel.reload.session_status).to eq('connected')
      end

      it 'shows every sidecar session that is not matched to a Rails channel' do
        channel = create(:channel_baileys_whatsapp, session_id: '1_current', session_status: 'connected')
        allow(sidecar_service).to receive(:sessions).and_return(
          {
            sessions: [
              { 'session_id' => channel.session_id, 'client_slug' => nil, 'status' => 'connected', 'phone_number' => '5511999999999' },
              { 'session_id' => channel.session_id, 'client_slug' => 'client-a', 'status' => 'connected', 'phone_number' => '5511888888888' },
              { 'session_id' => '1_orphan', 'client_slug' => nil, 'status' => 'connected', 'phone_number' => '5511777777777' }
            ],
            error: nil
          }
        )

        sign_in(super_admin, scope: :super_admin)
        get '/super_admin/whatsapp', params: { tab: 'whatsapp_web' }

        expect(response).to have_http_status(:success)
        expect(response.body).to include(channel.session_id)
        expect(response.body).to include('client-a')
        expect(response.body).to include('1_orphan')
        expect(response.body).to include('Orphan sidecar sessions')
      end
    end
  end

  describe 'POST /super_admin/whatsapp' do
    it 'updates WhatsApp Cloud API settings' do
      sign_in(super_admin, scope: :super_admin)

      post '/super_admin/whatsapp', params: { app_config: { WHATSAPP_APP_ID: 'new-app-id' } }

      expect(response).to redirect_to('/super_admin/whatsapp?tab=cloud_api')
      expect(InstallationConfig.find_by(name: 'WHATSAPP_APP_ID').value).to eq('new-app-id')
    end
  end

  describe 'POST /super_admin/whatsapp/revoke_session' do
    it 'revokes a Rails-backed WhatsApp Web session' do
      channel = create(:channel_baileys_whatsapp, session_status: 'connected')
      provider_service = instance_double(Baileys::ProviderService, disconnect: {})
      allow(Baileys::ProviderService).to receive(:new).and_return(provider_service)

      sign_in(super_admin, scope: :super_admin)
      post '/super_admin/whatsapp/revoke_session', params: { channel_id: channel.id }

      expect(response).to redirect_to('/super_admin/whatsapp?tab=whatsapp_web')
      expect(channel.reload.session_status).to eq('disconnected')
    end
  end

  describe 'POST /super_admin/whatsapp/delete_session' do
    it 'deletes a Rails-backed WhatsApp Web session while keeping the inbox reconnectable' do
      channel = create(:channel_baileys_whatsapp, session_status: 'connected', phone_number: '+5511999999999')
      inbox = channel.inbox
      previous_session_id = channel.session_id
      provider_service = instance_double(Baileys::ProviderService, disconnect: {})
      allow(Baileys::ProviderService).to receive(:new).and_return(provider_service)
      allow(sidecar_service).to receive(:sessions).and_return(
        {
          sessions: [
            { 'session_id' => previous_session_id, 'client_slug' => 'client-a', 'status' => 'connected' }
          ],
          error: nil
        }
      )

      sign_in(super_admin, scope: :super_admin)
      post '/super_admin/whatsapp/delete_session', params: { channel_id: channel.id }

      expect(response).to redirect_to('/super_admin/whatsapp?tab=whatsapp_web')
      expect(inbox.reload.channel).to eq(channel.reload)
      expect(channel.session_status).to eq('disconnected')
      expect(channel.phone_number).to be_nil
      expect(channel.session_id).not_to eq(previous_session_id)
      expect(sidecar_service).to have_received(:disconnect).with(session_id: previous_session_id, client_slug: 'client-a')
    end
  end

  describe 'POST /super_admin/whatsapp/delete_account_sessions' do
    it 'deletes every WhatsApp Web session for the account without deleting inboxes' do
      account = create(:account)
      channel = create(:channel_baileys_whatsapp, account: account, session_status: 'connected')
      inbox = channel.inbox
      provider_service = instance_double(Baileys::ProviderService, disconnect: {})
      allow(Baileys::ProviderService).to receive(:new).and_return(provider_service)
      allow(sidecar_service).to receive(:sessions).and_return(
        {
          sessions: [
            { 'session_id' => "#{account.id}_orphan", 'client_slug' => nil, 'status' => 'connected' }
          ],
          error: nil
        }
      )

      sign_in(super_admin, scope: :super_admin)
      post '/super_admin/whatsapp/delete_account_sessions', params: { account_id: account.id }

      expect(response).to redirect_to('/super_admin/whatsapp?tab=whatsapp_web')
      expect(inbox.reload.channel).to eq(channel.reload)
      expect(channel.session_status).to eq('disconnected')
      expect(sidecar_service).to have_received(:disconnect).with(session_id: "#{account.id}_orphan", client_slug: nil)
    end
  end

  describe 'POST /super_admin/whatsapp/revoke_orphan_session' do
    it 'revokes an orphan sidecar session explicitly' do
      sign_in(super_admin, scope: :super_admin)
      post '/super_admin/whatsapp/revoke_orphan_session', params: { session_id: '1_orphan' }

      expect(response).to redirect_to('/super_admin/whatsapp?tab=whatsapp_web')
      expect(flash[:notice]).to eq('WhatsApp Web session 1_orphan was revoked.')
    end
  end

  describe 'POST /super_admin/whatsapp/delete_orphan_session' do
    it 'deletes an orphan sidecar session explicitly' do
      sign_in(super_admin, scope: :super_admin)
      post '/super_admin/whatsapp/delete_orphan_session', params: { session_id: '1_orphan' }

      expect(response).to redirect_to('/super_admin/whatsapp?tab=whatsapp_web')
      expect(flash[:notice]).to eq(
        'WhatsApp Web session 1_orphan was deleted. The inbox can reconnect with a new WhatsApp Web session.'
      )
    end
  end
end
