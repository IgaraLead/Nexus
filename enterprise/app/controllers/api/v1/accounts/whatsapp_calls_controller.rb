class Api::V1::Accounts::WhatsappCallsController < Api::V1::Accounts::BaseController
  PERMISSION_REQUEST_THROTTLE = 5.minutes

  before_action :set_call, only: %i[show accept reject terminate upload_recording]
  before_action :set_conversation, only: :initiate
  before_action :ensure_calling_enabled, only: :initiate
  before_action :ensure_sdp_offer, only: :initiate
  before_action :ensure_contact_phone, only: :initiate
  before_action :ensure_recording_present, only: :upload_recording
  before_action :ensure_call_message, only: :upload_recording

  rescue_from Voice::CallErrors::NotRinging,
              Voice::CallErrors::AlreadyAccepted,
              Voice::CallErrors::CallFailed,
              with: :render_call_error
  rescue_from Voice::CallErrors::NoCallPermission, with: :render_permission_request

  def show; end

  def accept
    call_service.accept
  end

  def reject
    call_service.reject
  end

  def terminate
    call_service.terminate
  end

  def upload_recording
    @upload_status = @call.message.with_lock { attach_recording_idempotently }
  end

  def initiate
    @call = create_outbound_call
    @message = Voice::CallMessageBuilder.new(@call).perform!
    @call.update!(message_id: @message.id)
  end

  private

  def call_service
    @call_service ||= Whatsapp::CallService.new(call: @call, agent: Current.user, sdp_answer: params[:sdp_answer])
  end

  def set_call
    @call = Current.account.calls.whatsapp.find(params[:id])
    authorize @call.conversation, :show?
  end

  def set_conversation
    @conversation = Current.account.conversations.find_by!(display_id: params[:conversation_id])
    authorize @conversation, :show?
  end

  # Twilio voice also exposes voice_enabled? but uses a different initiation path.
  def ensure_calling_enabled
    channel = @conversation.inbox.channel
    return if channel.is_a?(Channel::Whatsapp) && channel.voice_enabled?

    render_could_not_create_error(I18n.t('errors.whatsapp.calls.not_enabled'))
  end

  def ensure_sdp_offer
    return if params[:sdp_offer].present?

    render_could_not_create_error(I18n.t('errors.whatsapp.calls.sdp_offer_required'))
  end

  def ensure_contact_phone
    return if @conversation.contact&.phone_number.present?

    render_could_not_create_error(I18n.t('errors.whatsapp.calls.contact_phone_required'))
  end

  def ensure_recording_present
    return if params[:recording].present?

    render_could_not_create_error(I18n.t('errors.whatsapp.calls.no_recording'))
  end

  def ensure_call_message
    return if @call.message.present?

    render_could_not_create_error(I18n.t('errors.whatsapp.calls.no_message'))
  end

  def attach_recording_idempotently
    return 'already_uploaded' if @call.message.attachments.exists?(file_type: :audio)

    @call.message.attachments.create!(account_id: @call.account_id, file_type: :audio, file: params[:recording])
    'uploaded'
  end

  # Browser-built SDP offer is forwarded to Meta; the connect webhook later delivers Meta's answer.
  def create_outbound_call
    contact_phone = @conversation.contact.phone_number.delete('+')
    result = @conversation.inbox.channel.provider_service.initiate_call(contact_phone, params[:sdp_offer])
    provider_call_id = result.dig('calls', 0, 'id') || result['call_id']

    Current.account.calls.create!(
      provider: :whatsapp, inbox: @conversation.inbox, conversation: @conversation, contact: @conversation.contact,
      provider_call_id: provider_call_id, direction: :outgoing, status: 'ringing',
      accepted_by_agent_id: Current.user.id,
      meta: { 'sdp_offer' => params[:sdp_offer], 'ice_servers' => Call.default_ice_servers }
    )
  end

  # 138006 = no call permission yet; send opt-in template (throttled) and surface state to FE.
  def render_permission_request
    return render json: { status: 'permission_pending' } if permission_request_throttled?

    sent = @conversation.inbox.channel.provider_service.send_call_permission_request(@conversation.contact.phone_number.delete('+'))
    return render_could_not_create_error(I18n.t('errors.whatsapp.calls.permission_request_failed')) unless sent

    record_permission_request_wamid(sent)
    render json: { status: 'permission_requested' }
  end

  def permission_request_throttled?
    last_requested = @conversation.additional_attributes&.dig('call_permission_requested_at')
    last_requested.present? && Time.zone.parse(last_requested) > PERMISSION_REQUEST_THROTTLE.ago
  end

  # Record the wamid so the reply webhook can match context.id back to this conversation.
  def record_permission_request_wamid(sent)
    attrs = (@conversation.additional_attributes || {}).merge(
      'call_permission_requested_at' => Time.current.iso8601,
      'call_permission_request_message_id' => sent.dig('messages', 0, 'id')
    )
    @conversation.update!(additional_attributes: attrs)
  end

  def render_call_error(error)
    render_could_not_create_error(error.message)
  end
end
