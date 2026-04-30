class Api::V1::Accounts::WhatsappCallsController < Api::V1::Accounts::BaseController
  PERMISSION_REQUEST_THROTTLE = 5.minutes

  before_action :set_call, only: %i[show accept reject terminate upload_recording]
  before_action :set_conversation, only: :initiate

  def show; end

  def accept
    @call = Whatsapp::CallService.new(call: @call, agent: Current.user, sdp_answer: params[:sdp_answer]).accept
  rescue Voice::CallErrors::NotRinging, Voice::CallErrors::AlreadyAccepted, Voice::CallErrors::CallFailed => e
    render_could_not_create_error(e.message)
  end

  def reject
    @call = Whatsapp::CallService.new(call: @call, agent: Current.user).reject
  end

  def terminate
    @call = Whatsapp::CallService.new(call: @call, agent: Current.user).terminate
  end

  # Browser-supplied recording captured via MediaRecorder during the call.
  # Idempotent: subsequent uploads no-op once the first audio attachment exists.
  def upload_recording
    return render_could_not_create_error('No recording file provided') if params[:recording].blank?
    return render_could_not_create_error('Call has no associated message') if @call.message.blank?

    @upload_status = if @call.message.attachments.exists?(file_type: :audio)
                       'already_uploaded'
                     else
                       @call.message.attachments.create!(account_id: @call.account_id, file_type: :audio, file: params[:recording])
                       'uploaded'
                     end
  end

  def initiate
    return render_could_not_create_error('Calling is not enabled for this inbox') unless calling_enabled?(@conversation)
    return render_could_not_create_error('sdp_offer is required') if params[:sdp_offer].blank?

    @call = create_outbound_call(@conversation, params[:sdp_offer])
    @message = Voice::CallMessageBuilder.new(@call).perform!
    @call.update!(message_id: @message.id)
  rescue Voice::CallErrors::NoCallPermission
    handle_no_call_permission(@conversation)
  end

  private

  def set_call
    @call = Current.account.calls.whatsapp.find(params[:id])
    authorize @call.conversation, :show?
  end

  def set_conversation
    @conversation = Current.account.conversations.find_by!(display_id: params[:conversation_id])
    authorize @conversation, :show?
  end

  def calling_enabled?(conversation)
    channel = conversation.inbox.channel
    channel.respond_to?(:voice_enabled?) && channel.voice_enabled?
  end

  # Browser-built SDP offer is forwarded to Meta; the connect webhook later delivers Meta's answer.
  def create_outbound_call(conversation, sdp_offer)
    contact_phone = conversation.contact&.phone_number
    raise ArgumentError, 'Contact phone number not available' if contact_phone.blank?

    result = conversation.inbox.channel.provider_service.initiate_call(contact_phone.delete('+'), sdp_offer)
    provider_call_id = result.dig('calls', 0, 'id') || result['call_id']

    Current.account.calls.create!(
      provider: :whatsapp, inbox: conversation.inbox, conversation: conversation, contact: conversation.contact,
      provider_call_id: provider_call_id, direction: :outgoing, status: 'ringing',
      accepted_by_agent_id: Current.user.id,
      meta: { 'sdp_offer' => sdp_offer, 'ice_servers' => Call.default_ice_servers }
    )
  end

  # 138006 = no call permission yet; send opt-in template (throttled) and surface state to FE.
  def handle_no_call_permission(conversation)
    last_requested = conversation.additional_attributes&.dig('call_permission_requested_at')
    if last_requested.present? && Time.zone.parse(last_requested) > PERMISSION_REQUEST_THROTTLE.ago
      return render json: { status: 'permission_pending' }
    end

    contact_phone = conversation.contact.phone_number.delete('+')
    sent = conversation.inbox.channel.provider_service.send_call_permission_request(contact_phone)
    return render_could_not_create_error('Failed to send call permission request') unless sent

    attrs = (conversation.additional_attributes || {}).merge('call_permission_requested_at' => Time.current.iso8601)
    conversation.update!(additional_attributes: attrs)
    render json: { status: 'permission_requested' }
  end
end
