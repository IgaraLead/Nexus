class AddAdditionalAttributesToCompanies < ActiveRecord::Migration[7.1]
  def change
    add_column :companies, :additional_attributes, :jsonb, default: {}
    add_column :companies, :custom_attributes, :jsonb, default: {}
    add_column :companies, :last_activity_at, :datetime, precision: nil

    add_index :companies, [:account_id, :last_activity_at],
              order: { last_activity_at: 'DESC NULLS LAST' },
              name: 'index_companies_on_account_id_and_last_activity_at'
  end
end
