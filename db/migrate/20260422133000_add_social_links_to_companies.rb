class AddSocialLinksToCompanies < ActiveRecord::Migration[7.1]
  def change
    change_table :companies, bulk: true do |table|
      table.string :linkedin_url
      table.string :twitter_url
      table.string :github_url
      table.string :instagram_url
    end
  end
end
