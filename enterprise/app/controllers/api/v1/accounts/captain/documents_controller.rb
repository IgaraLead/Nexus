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
      stale: base_query.stale.count,
      syncing: base_query.sync_syncing.count,
      synced_last_7_days: base_query.synced_since(Captain::Document::STALE_THRESHOLD.ago).count
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

    Captain::Documents::PerformSyncJob.perform_later(@document)
    head :accepted
  end

  def destroy
    @document.destroy
    head :no_content
  end

  private

  def set_documents
    @documents = Current.account.captain_documents.includes(:assistant).ordered
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
    when 'stale' then scope.stale
    when 'syncing' then scope.sync_syncing
    when 'synced_last_7_days' then scope.synced_since(Captain::Document::STALE_THRESHOLD.ago)
    else scope
    end
  end

  def document_params
    params.require(:document).permit(:name, :external_link, :assistant_id, :pdf_file)
  end
end
