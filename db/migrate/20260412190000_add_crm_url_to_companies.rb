class AddCrmUrlToCompanies < ActiveRecord::Migration[7.1]
  def change
    add_column :companies, :crm_url, :string
  end
end
