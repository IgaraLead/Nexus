class Api::V1::Accounts::Companies::ContactsController < Api::V1::Accounts::EnterpriseAccountsController
  RESULTS_PER_PAGE = 15

  before_action :fetch_company
  before_action :authorize_company_read!, only: [:index, :search]
  before_action :authorize_company_update!, only: [:create, :destroy]
  before_action :set_current_page, only: [:index, :search]
  before_action :fetch_linked_contact, only: [:destroy]

  def index
    @contacts = paginated_contacts(@company.contacts.order(:name, :id))
    @contacts_count = @contacts.total_count
  end

  def search
    return render json: { error: 'Specify search string with parameter q' }, status: :unprocessable_entity if params[:q].blank?

    @contacts = paginated_contacts(contact_search_scope)
    @contacts_count = @contacts.total_count
  end

  def create
    @contact = membership_service.assign(contact: fetch_existing_contact)
  end

  def destroy
    membership_service.remove(contact: @contact)
    head :ok
  end

  private

  def fetch_company
    @company = Current.account.companies.find(params[:company_id])
  end

  def authorize_company_read!
    authorize @company, :show?
  end

  def authorize_company_update!
    authorize @company, :update?
  end

  def fetch_linked_contact
    @contact = @company.contacts.find(params[:id])
  end

  def fetch_existing_contact
    Current.account.contacts.find(params.require(:contact_id))
  end

  def membership_service
    @membership_service ||= Companies::ContactMembershipService.new(company: @company)
  end

  def set_current_page
    @current_page = params[:page] || 1
  end

  def paginated_contacts(scope)
    scope
      .includes({ avatar_attachment: [:blob] }, { company: { avatar_attachment: [:blob] } })
      .page(@current_page)
      .per(RESULTS_PER_PAGE)
  end

  def contact_search_scope
    Current.account.contacts
           .where(
             'name ILIKE :search OR email ILIKE :search OR phone_number ILIKE :search OR contacts.identifier ILIKE :search',
             search: "%#{params[:q].strip}%"
           )
           .order(:name, :id)
  end
end
