class AddAdditionalAttributesToCompanies < ActiveRecord::Migration[7.1]
  def change
    add_column :companies, :additional_attributes, :jsonb, default: {}
  end
end
