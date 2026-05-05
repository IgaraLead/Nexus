# frozen_string_literal: true

class Api::V1::Accounts::BaileysSessionsController < Api::V1::Accounts::BaseController
  before_action :fetch_inbox
  before_action :check_authorization

  def qr_code
    channel = @inbox.channel
    return render json: { error: 'Inbox has no channel' }, status: :unprocessable_entity unless channel
    unless channel.is_a?(Channel::BaileysWhatsapp)
      return render json: { error: 'Not a Baileys channel' }, status: :unprocessable_entity
    end

    result = channel.request_qr_code(
      force: ActiveModel::Type::Boolean.new.cast(params[:force]),
      sync_full_history: ActiveModel::Type::Boolean.new.cast(
        params[:sync_full_history].nil? ? true : params[:sync_full_history]
      ),
      import_groups: ActiveModel::Type::Boolean.new.cast(params[:import_groups])
    )
    if result.is_a?(Hash) && result['error'].present?
      render json: { error: result['error'], session_id: channel.session_id, session_status: channel.session_status },
             status: :bad_gateway
    elsif result.is_a?(Hash) && result['qr'].present?
      render json: { qr_code: result['qr'], session_id: channel.session_id, session_status: channel.session_status }
    else
      render json: { session_id: channel.session_id, session_status: channel.session_status,
                     message: 'QR code requested, waiting for sidecar response' }
    end
  end

  def status
    channel = @inbox.channel
    return render json: { error: 'Inbox has no channel' }, status: :unprocessable_entity unless channel
    unless channel.is_a?(Channel::BaileysWhatsapp)
      return render json: { error: 'Not a Baileys channel' }, status: :unprocessable_entity
    end

    render json: {
      session_id: channel.session_id,
      session_status: channel.session_status,
      phone_number: channel.phone_number,
      last_connected_at: channel.last_connected_at,
      qr_code: channel.provider_config&.dig('qr_code')
    }
  end

  def disconnect
    channel = @inbox.channel
    return render json: { error: 'Inbox has no channel' }, status: :unprocessable_entity unless channel
    unless channel.is_a?(Channel::BaileysWhatsapp)
      return render json: { error: 'Not a Baileys channel' }, status: :unprocessable_entity
    end

    channel.disconnect_session
    render json: { status: 'disconnected' }
  end

  private

  def fetch_inbox
    @inbox = Current.account.inboxes.find(params[:id])
  end

  def check_authorization
    authorize @inbox, :update?
  end
end
