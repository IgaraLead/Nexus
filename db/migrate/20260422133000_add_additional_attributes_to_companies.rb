class AddAdditionalAttributesToCompanies < ActiveRecord::Migration[7.1]
  def change
    add_column :companies, :additional_attributes, :jsonb, default: {}
    add_column :companies, :custom_attributes, :jsonb, default: {}
    add_column :companies, :last_activity_at, :datetime, precision: nil

    add_index :companies, [:account_id, :last_activity_at],
              order: { last_activity_at: 'DESC NULLS LAST' },
              name: 'index_companies_on_account_id_and_last_activity_at'

    reversible do |dir|
      dir.up { backfill_company_last_activity }
    end
  end

  private

  def backfill_company_last_activity
    execute <<~SQL.squish
      UPDATE companies
      SET last_activity_at = company_activities.last_activity_at
      FROM (
        SELECT company_id, MAX(activity_at) AS last_activity_at
        FROM (
          SELECT company_id, last_activity_at AS activity_at
          FROM contacts
          WHERE company_id IS NOT NULL AND last_activity_at IS NOT NULL
          UNION ALL
          SELECT contacts.company_id, conversations.last_activity_at AS activity_at
          FROM conversations
          INNER JOIN contacts ON contacts.id = conversations.contact_id
          WHERE contacts.company_id IS NOT NULL AND conversations.last_activity_at IS NOT NULL
        ) activities
        GROUP BY company_id
      ) company_activities
      WHERE companies.id = company_activities.company_id
    SQL
  end
end
