# == Schema Information
#
# Table name: companies
#
#  additional_attributes :jsonb
#  custom_attributes     :jsonb
#  last_activity_at      :datetime
#  id             :bigint           not null, primary key
#  contacts_count :integer
#  description    :text
#  domain         :string
#  name           :string           not null
#  created_at     :datetime         not null
#  updated_at     :datetime         not null
#  account_id     :bigint           not null
#
# Indexes
#
#  index_companies_on_account_and_domain                (account_id,domain) UNIQUE WHERE (domain IS NOT NULL)
#  index_companies_on_account_id                        (account_id)
#  index_companies_on_name_and_account_id               (name,account_id)
#
class Company < ApplicationRecord
  include Avatarable

  SEARCHABLE_COLUMNS = [:name, :domain].freeze

  validates :account_id, presence: true
  validates :name, presence: true, length: { maximum: Limits::COMPANY_NAME_LENGTH_LIMIT }
  validates :domain, allow_blank: true, format: {
    with: /\A[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+\z/,
    message: I18n.t('errors.companies.domain.invalid')
  }
  validates :domain, uniqueness: { scope: :account_id }, if: -> { domain.present? }
  validates :description, length: { maximum: Limits::COMPANY_DESCRIPTION_LENGTH_LIMIT }

  belongs_to :account
  has_many :contacts, dependent: :nullify
  after_create_commit :fetch_favicon, if: -> { domain.present? }

  scope :ordered_by_name, -> { order(:name) }
  scope :search_by_name_or_domain, lambda { |query|
    search_query = "%#{sanitize_sql_like(query.strip)}%"

    where(
      SEARCHABLE_COLUMNS
        .map { |column| arel_table[column].matches(search_query) }
        .reduce(&:or)
    )
  }

  scope :order_on_contacts_count, lambda { |direction|
    sort_direction = direction.to_s.downcase == 'asc' ? :asc : :desc

    order(arel_table[:contacts_count].public_send(sort_direction).nulls_last)
  }
  scope :order_on_last_activity_at, lambda { |direction|
    sort_direction = direction.to_s.downcase == 'asc' ? :asc : :desc

    order(arel_table[:last_activity_at].public_send(sort_direction).nulls_last)
  }

  private

  def fetch_favicon
    Avatar::AvatarFromFaviconJob.set(wait: 5.seconds).perform_later(self)
  end
end
