class Api::V1::Accounts::Captain::DocumentsController < Api::V1::Accounts::BaseController
  before_action :current_account
  before_action -> { check_authorization(Captain::Assistant) }

  before_action :set_current_page, only: [:index]
  before_action :set_documents, except: [:create]
  before_action :set_document, only: [:show, :destroy, :sync]
  before_action :set_assistant, only: [:create]
  RESULTS_PER_PAGE = 25

  def index
    base_query = @documents
    base_query = base_query.where(assistant_id: permitted_params[:assistant_id]) if permitted_params[:assistant_id].present?
    base_query = apply_filter(base_query, permitted_params[:filter])

    @documents_count = base_query.count
    @documents = base_query.page(@current_page).per(RESULTS_PER_PAGE)
  end

  def stats
    base_query = @documents.syncable
    base_query = base_query.where(assistant_id: permitted_params[:assistant_id]) if permitted_params[:assistant_id].present?

    @stats = {
      total: base_query.count,
      stale: stale_documents(base_query).count,
      syncing: base_query.sync_in_progress.count,
      synced_recently: synced_recently_documents(base_query).count,
      sync_interval_hours: current_sync_interval&.in_hours&.to_i
    }
  end

  def show; end

  def create
    return render_could_not_create_error('Missing Assistant') if @assistant.nil?

    @document = @assistant.documents.build(document_params)
    @document.save!
  rescue Captain::Document::LimitExceededError => e
    render_could_not_create_error(e.message)
  rescue ActiveRecord::RecordInvalid => e
    render_could_not_create_error(e.record.errors.full_messages.join(', '))
  end

  def sync
    return render_could_not_create_error(I18n.t('captain.documents.sync_not_supported_for_pdf')) unless @document.syncable?
    return render_could_not_create_error(I18n.t('captain.documents.sync_only_available_documents')) unless @document.available?
    return render_could_not_create_error(I18n.t('captain.documents.sync_already_in_progress')) if @document.sync_in_progress?

    @document.update!(sync_status: :syncing, last_sync_attempted_at: Time.current)
    Captain::Documents::PerformSyncJob.perform_later(@document)
    head :accepted
  end

  def destroy
    @document.destroy
    head :no_content
  end

  private

  def set_documents
    @documents = Current.account.captain_documents.with_attached_pdf_file.includes(:assistant).ordered
  end

  def set_document
    @document = @documents.find(permitted_params[:id])
  end

  def set_assistant
    @assistant = Current.account.captain_assistants.find_by(id: document_params[:assistant_id])
  end

  def set_current_page
    @current_page = permitted_params[:page] || 1
  end

  def permitted_params
    params.permit(:assistant_id, :page, :id, :account_id, :filter)
  end

  def apply_filter(scope, filter)
    case filter
    when 'stale' then stale_documents(scope)
    when 'syncing' then scope.sync_in_progress
    when 'synced_recently' then synced_recently_documents(scope)
    else scope
    end
  end

  def stale_documents(scope)
    return scope.none unless current_sync_interval

    scope.stale(current_sync_interval.ago)
  end

  def synced_recently_documents(scope)
    return scope.none unless current_sync_interval

    scope.synced_since(current_sync_interval.ago)
  end

  def current_sync_interval
    return @current_sync_interval if defined?(@current_sync_interval)

    @current_sync_interval = Current.account.captain_document_sync_interval
  end

  def document_params
    params.require(:document).permit(:name, :external_link, :assistant_id, :pdf_file)
  end
end
