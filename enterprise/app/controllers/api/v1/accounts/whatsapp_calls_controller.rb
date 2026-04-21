class Api::V1::Accounts::WhatsappCallsController < Api::V1::Accounts::BaseController
  ALLOWED_PEER_ROLES = %w[listen_only participant].freeze
  ALLOWED_AUDIO_MODES = %w[replace mix].freeze

  before_action :ensure_whatsapp_call_enabled
  before_action :set_call, only: [:show, :accept, :reject, :terminate, :upload_recording, :agent_answer, :reconnect, :join, :play_audio]

  def show
    render json: {
      id: @call.id,
      call_id: @call.provider_call_id,
      status: @call.status,
      direction: @call.direction_label,
      conversation_id: @call.conversation_id,
      inbox_id: @call.inbox_id,
      message_id: @call.message_id,
      sdp_offer: @call.ringing? ? @call.sdp_offer : nil,
      ice_servers: @call.ice_servers,
      caller: caller_info
    }
  end

  def accept
    if Call.media_server_enabled?
      call = Whatsapp::CallService.new(call: @call, agent: current_user).accept
      render json: { id: call.id, status: call.status, message_id: call.message_id, media_session_id: call.media_session_id }
    else
      sdp_answer = params[:sdp_answer]
      return render json: { error: 'sdp_answer is required' }, status: :unprocessable_entity if sdp_answer.blank?

      call = Whatsapp::CallService.new(call: @call, agent: current_user).pre_accept_and_accept(sdp_answer)
      render json: { id: call.id, status: call.status, message_id: call.message_id }
    end
  rescue Whatsapp::CallErrors::NotRinging, Whatsapp::CallErrors::AlreadyAccepted => e
    render json: { error: e.message }, status: :unprocessable_entity
  rescue StandardError => e
    Rails.logger.error "[WHATSAPP CALL] accept failed: #{e.message}"
    render json: { error: 'Failed to accept call' }, status: :internal_server_error
  end

  def reject
    call = Whatsapp::CallService.new(call: @call, agent: current_user).reject
    render json: { id: call.id, status: call.status }
  rescue StandardError => e
    Rails.logger.error "[WHATSAPP CALL] reject failed: #{e.message}"
    render json: { error: 'Failed to reject call' }, status: :internal_server_error
  end

  def terminate
    call = Whatsapp::CallService.new(call: @call, agent: current_user).terminate
    render json: { id: call.id, status: call.status }
  rescue StandardError => e
    Rails.logger.error "[WHATSAPP CALL] terminate failed: #{e.message}"
    render json: { error: 'Failed to terminate call' }, status: :internal_server_error
  end

  def upload_recording
    return render json: { error: 'No recording file provided' }, status: :unprocessable_entity if params[:recording].blank?
    return render json: { error: 'Call is not ended' }, status: :unprocessable_entity unless @call.terminal?

    attach_recording_and_enqueue_transcription
    render json: { id: @call.id, status: 'uploaded' }
  rescue StandardError => e
    Rails.logger.error "[WHATSAPP CALL] upload_recording failed: #{e.message}"
    render json: { error: 'Failed to upload recording' }, status: :internal_server_error
  end

  def active
    call = current_account.calls.whatsapp.active_for_agent(current_user.id).last
    if call
      elapsed = call.started_at ? (Time.current - call.started_at).to_i : 0
      render json: {
        id: call.id,
        call_id: call.provider_call_id,
        conversation_id: call.conversation_id,
        status: call.status,
        elapsed_seconds: elapsed,
        media_session_id: call.media_session_id
      }
    else
      render json: { call: nil }
    end
  end

  def agent_answer
    return render json: { error: 'sdp_answer is required' }, status: :unprocessable_entity if params[:sdp_answer].blank?
    return render json: { error: 'No media session' }, status: :unprocessable_entity if @call.media_session_id.blank?

    client = Whatsapp::MediaServerClient.new
    client.set_agent_answer(@call.media_session_id, sdp_answer: params[:sdp_answer])
    render json: { success: true }
  rescue Whatsapp::MediaServerClient::SessionError, Whatsapp::MediaServerClient::ConnectionError => e
    Rails.logger.error "[WHATSAPP CALL] agent_answer failed: #{e.message}"
    render json: { error: 'Failed to set agent answer' }, status: :internal_server_error
  end

  def reconnect
    return render json: { error: 'No media session' }, status: :unprocessable_entity if @call.media_session_id.blank?
    return render json: { error: 'Call is not in progress' }, status: :unprocessable_entity unless @call.in_progress?

    client = Whatsapp::MediaServerClient.new
    response = client.reconnect_agent(@call.media_session_id)
    render json: {
      sdp_offer: response['sdp_offer'],
      ice_servers: response['ice_servers']
    }
  rescue Whatsapp::MediaServerClient::SessionError, Whatsapp::MediaServerClient::ConnectionError => e
    Rails.logger.error "[WHATSAPP CALL] reconnect failed: #{e.message}"
    render json: { error: 'Failed to reconnect' }, status: :internal_server_error
  end

  def join
    return render json: { error: 'No media session' }, status: :unprocessable_entity if @call.media_session_id.blank?

    role = params[:role] || 'listen_only'
    return render json: { error: 'Invalid role' }, status: :unprocessable_entity unless ALLOWED_PEER_ROLES.include?(role)

    client = Whatsapp::MediaServerClient.new
    response = client.add_peer(@call.media_session_id, role: role, label: current_user.name)
    render json: {
      peer_id: response['peer_id'],
      sdp_offer: response['sdp_offer'],
      ice_servers: response['ice_servers']
    }
  rescue Whatsapp::MediaServerClient::SessionError, Whatsapp::MediaServerClient::ConnectionError => e
    Rails.logger.error "[WHATSAPP CALL] join failed: #{e.message}"
    render json: { error: 'Failed to join call' }, status: :internal_server_error
  end

  def play_audio
    return render json: { error: 'No media session' }, status: :unprocessable_entity if @call.media_session_id.blank?
    return render json: { error: 'file_path is required' }, status: :unprocessable_entity if params[:file_path].blank?
    return render json: { error: 'Invalid file_path' }, status: :unprocessable_entity if params[:file_path].include?('..')

    mode = params[:mode] || 'replace'
    return render json: { error: 'Invalid mode' }, status: :unprocessable_entity unless ALLOWED_AUDIO_MODES.include?(mode)

    client = Whatsapp::MediaServerClient.new
    response = client.inject_audio(
      @call.media_session_id,
      file_path: params[:file_path],
      mode: mode,
      loop: ActiveModel::Type::Boolean.new.cast(params[:loop])
    )
    render json: { injection_id: response['injection_id'] }
  rescue Whatsapp::MediaServerClient::SessionError, Whatsapp::MediaServerClient::ConnectionError => e
    Rails.logger.error "[WHATSAPP CALL] play_audio failed: #{e.message}"
    render json: { error: 'Failed to play audio' }, status: :internal_server_error
  end

  def initiate
    conversation = current_account.conversations.find(params[:conversation_id])
    authorize conversation, :show?
    error = validate_whatsapp_calling(conversation)
    return render json: { error: error }, status: :unprocessable_entity if error

    call = create_outbound_call(conversation)
    message = Whatsapp::CallMessageBuilder.create!(conversation: conversation, call: call, user: current_user)
    call.update!(message_id: message.id)
    render json: { status: 'calling', call_id: call.provider_call_id, id: call.id, message_id: message.id }
  rescue Whatsapp::CallErrors::NoCallPermission
    handle_no_call_permission(conversation)
  rescue ActiveRecord::RecordNotFound
    render json: { error: 'Conversation not found' }, status: :not_found
  rescue StandardError => e
    Rails.logger.error "[WHATSAPP CALL] initiate failed: #{e.message}"
    render json: { error: e.message }, status: :unprocessable_entity
  end

  private

  def create_outbound_call(conversation)
    contact_phone = conversation.contact&.phone_number
    raise ArgumentError, 'Contact phone number not available' if contact_phone.blank?
    raise ArgumentError, 'sdp_offer is required' if params[:sdp_offer].blank? && !Call.media_server_enabled?

    if Call.media_server_enabled?
      create_outbound_call_via_media_server(conversation, contact_phone)
    else
      create_outbound_call_direct(conversation, contact_phone)
    end
  end

  def create_outbound_call_direct(conversation, contact_phone)
    result = conversation.inbox.channel.provider_service.initiate_call(contact_phone.delete('+'), params[:sdp_offer])
    provider_call_id = result.dig('calls', 0, 'id') || result['call_id']

    current_account.calls.create!(
      provider: :whatsapp,
      inbox: conversation.inbox, conversation: conversation, contact: conversation.contact,
      provider_call_id: provider_call_id, direction: :outgoing, status: 'ringing',
      meta: { sdp_offer: params[:sdp_offer] }
    )
  end

  def create_outbound_call_via_media_server(conversation, contact_phone)
    client = Whatsapp::MediaServerClient.new

    # Step 1: Create session on media server (generates SDP offer for Meta)
    session_response = client.create_session(
      call_id: "pending_#{SecureRandom.hex(8)}",
      sdp_offer: nil,
      ice_servers: [{ urls: 'stun:stun.l.google.com:19302' }],
      account_id: current_account.id
    )

    # Step 2: Send the media server's SDP offer to Meta to initiate the call
    sdp_offer = session_response['meta_sdp_answer'] || session_response['sdp_offer']
    result = conversation.inbox.channel.provider_service.initiate_call(contact_phone.delete('+'), sdp_offer)
    provider_call_id = result.dig('calls', 0, 'id') || result['call_id']

    current_account.calls.create!(
      provider: :whatsapp,
      inbox: conversation.inbox, conversation: conversation, contact: conversation.contact,
      provider_call_id: provider_call_id, direction: :outgoing, status: 'ringing',
      media_session_id: session_response['session_id'],
      meta: { sdp_offer: sdp_offer }
    )
  end

  def handle_no_call_permission(conversation)
    last_requested = conversation.additional_attributes&.dig('call_permission_requested_at')

    return render json: { status: 'permission_pending' } if last_requested.present? && Time.zone.parse(last_requested) > 5.minutes.ago

    contact_phone = conversation.contact.phone_number.delete('+')
    result = conversation.inbox.channel.provider_service.send_call_permission_request(contact_phone)
    return render json: { error: 'Failed to send call permission request' }, status: :unprocessable_entity unless result

    attrs = (conversation.additional_attributes || {}).merge('call_permission_requested_at' => Time.current.iso8601)
    conversation.update!(additional_attributes: attrs)
    render json: { status: 'permission_requested' }
  end

  def validate_whatsapp_calling(conversation)
    channel = conversation.inbox.channel
    return 'Calling is only supported on WhatsApp Cloud inboxes' unless channel.is_a?(Channel::Whatsapp) && channel.provider == 'whatsapp_cloud'
    return 'Calling is not enabled for this inbox' unless channel.provider_config['calling_enabled']

    nil
  end

  def ensure_whatsapp_call_enabled
    render_payment_required('WhatsApp calling is not enabled for this account') unless current_account.feature_enabled?('whatsapp_call')
  end

  def set_call
    @call = current_account.calls.whatsapp.find(params[:id])
    authorize @call.conversation, :show?
  rescue ActiveRecord::RecordNotFound
    render json: { error: 'Call not found' }, status: :not_found
  end

  def attach_recording_and_enqueue_transcription
    @call.recording.attach(params[:recording])
    Whatsapp::CallMessageBuilder.update_recording_url!(call: @call)
    Whatsapp::CallTranscriptionJob.perform_later(@call.id)
  end

  def caller_info
    contact = @call.conversation&.contact
    return {} unless contact

    { name: contact.name, phone: contact.phone_number, avatar: contact.avatar_url }
  end
end
