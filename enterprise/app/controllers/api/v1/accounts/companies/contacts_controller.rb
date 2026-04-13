class Api::V1::Accounts::Companies::ContactsController < Api::V1::Accounts::EnterpriseAccountsController
  RESULTS_PER_PAGE = 15

  before_action :ensure_enterprise!
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
    ActiveRecord::Base.transaction do
      @contact = if params[:contact_id].present?
                   contact = fetch_existing_contact
                   membership_service.assign(contact: contact)
                 else
                   create_contact
                 end
    end
  end

  def destroy
    membership_service.remove(contact: @contact)
    head :ok
  end

  private

  def ensure_enterprise!
    raise Pundit::NotAuthorizedError unless ChatwootApp.enterprise?
  end

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
    Current.account.contacts.find(params[:contact_id])
  end

  def create_contact
    @contact = Current.account.contacts.new(contact_create_params)
    @contact.save!
    process_avatar_from_url
    @contact
  end

  def permitted_contact_params
    contact_params_source.permit(
      :name,
      :email,
      :phone_number,
      :identifier,
      :avatar,
      :blocked,
      :avatar_url,
      additional_attributes: {},
      custom_attributes: {}
    )
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
           .where(contact_search_sql, search: "%#{params[:q].strip}%")
           .order(:name, :id)
  end

  def contact_search_sql
    <<~SQL.squish
      contacts.name ILIKE :search
      OR contacts.email ILIKE :search
      OR contacts.phone_number ILIKE :search
      OR contacts.identifier ILIKE :search
    SQL
  end

  def contact_params_source
    @contact_params_source ||= params[:contact].present? ? params.require(:contact) : params
  end

  def contact_create_params
    permitted_contact_params.except(:avatar_url)
                            .merge(company_id: @company.id)
                            .merge(additional_attributes: contact_additional_attributes)
  end

  def contact_additional_attributes
    permitted_contact_params[:additional_attributes].to_h.merge('company_name' => @company.name)
  end

  def process_avatar_from_url
    ::Avatar::AvatarFromUrlJob.perform_later(@contact, permitted_contact_params[:avatar_url]) if permitted_contact_params[:avatar_url].present?
  end
end
