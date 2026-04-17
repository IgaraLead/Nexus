class Api::V1::Accounts::ConferenceController < Api::V1::Accounts::BaseController
  before_action :set_voice_inbox_for_conference

  def token
    render json: Voice::Provider::Twilio::TokenService.new(
      inbox: @voice_inbox,
      user: Current.user,
      account: Current.account
    ).generate
  end

  def create
    call = resolve_call!

    conference_service = Voice::Provider::Twilio::ConferenceService.new(call: call)
    conference_sid = conference_service.ensure_conference_sid
    conference_service.mark_agent_joined(user: current_user)

    render json: {
      status: 'success',
      id: call.conversation.display_id,
      conference_sid: conference_sid,
      using_webrtc: true
    }
  end

  def destroy
    call = resolve_call!
    Voice::Provider::Twilio::ConferenceService.new(call: call).end_conference
    render json: { status: 'success', id: call.conversation.display_id }
  end

  private

  def resolve_call!
    inbox_calls = Call.where(inbox_id: @voice_inbox.id, provider: :twilio)

    if params[:call_sid].present?
      inbox_calls.find_by!(provider_call_id: params[:call_sid])
    else
      conversation = fetch_conversation_by_display_id
      inbox_calls.where(conversation_id: conversation.id).active.order(created_at: :desc).first!
    end
  end

  def set_voice_inbox_for_conference
    @voice_inbox = Current.account.inboxes.find(params[:inbox_id])
    authorize @voice_inbox, :show?
  end

  def fetch_conversation_by_display_id
    cid = params[:conversation_id]
    raise ActiveRecord::RecordNotFound, 'conversation_id required' if cid.blank?

    conversation = @voice_inbox.conversations.find_by!(display_id: cid)
    authorize conversation, :show?
    conversation
  end
end
