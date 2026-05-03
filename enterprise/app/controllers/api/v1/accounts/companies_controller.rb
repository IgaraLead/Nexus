class Api::V1::Accounts::CompaniesController < Api::V1::Accounts::EnterpriseAccountsController
  include Sift
  sort_on :name, type: :string
  sort_on :domain, type: :string
  sort_on :created_at, type: :datetime
  sort_on :last_activity_at, internal_name: :order_on_last_activity_at, type: :scope, scope_params: [:direction]
  sort_on :contacts_count, internal_name: :order_on_contacts_count, type: :scope, scope_params: [:direction]

  RESULTS_PER_PAGE = 25

  before_action :ensure_companies_enabled!
  before_action :authorize_company_collection!, only: [:index, :search, :create]
  before_action :set_current_page, only: [:index, :search]
  before_action :fetch_company, only: [:show, :update, :destroy, :avatar]

  def index
    @companies = fetch_companies(resolved_companies)
    @companies_count = @companies.total_count
  end

  def search
    if params[:q].blank?
      return render json: { error: I18n.t('errors.companies.search.query_missing') },
                    status: :unprocessable_entity
    end

    companies = resolved_companies.search_by_name_or_domain(params[:q])
    @companies = fetch_companies(companies)
    @companies_count = @companies.total_count
  end

  def show; end

  def create
    @company = Current.account.companies.build(company_params)
    @company.save!
  end

  def update
    ActiveRecord::Base.transaction do
      # TODO: Revisit company activity tracking when we add a broader activity surface.
      @company.update!(company_params.merge(last_activity_at: Time.current))
      sync_linked_contact_names if @company.saved_change_to_name?
    end
  end

  def destroy
    ActiveRecord::Base.transaction do
      membership_service.cleanup_on_company_delete
      @company.destroy!
    end
    head :ok
  end

  def avatar
    @company.avatar.purge if @company.avatar.attached?
  end

  private

  def resolved_companies
    @resolved_companies ||= Current.account.companies
  end

  def set_current_page
    @current_page = params[:page] || 1
  end

  def fetch_companies(companies)
    filtrate(companies)
      .page(@current_page)
      .per(RESULTS_PER_PAGE)
  end

  def ensure_companies_enabled!
    return if Current.account.feature_enabled?('companies')

    render json: { error: 'Companies are not enabled for this account' }, status: :forbidden
  end

  def authorize_company_collection!
    authorize Company, :"#{action_name}?"
  end

  def fetch_company
    @company = Current.account.companies.find(params[:id])
    authorize @company, company_policy_action
  end

  def company_params
    params.require(:company).permit(
      :name,
      :domain,
      :description,
      :avatar,
      additional_attributes: {},
      custom_attributes: {}
    )
  end

  def company_policy_action
    return :update? if action_name == 'avatar'

    :"#{action_name}?"
  end

  def membership_service
    @membership_service ||= Companies::ContactMembershipService.new(company: @company)
  end

  def sync_linked_contact_names
    membership_service.sync_company_name
  end
end
