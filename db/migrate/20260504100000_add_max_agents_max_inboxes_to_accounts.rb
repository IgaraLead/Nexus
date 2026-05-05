# frozen_string_literal: true

class AddMaxAgentsMaxInboxesToAccounts < ActiveRecord::Migration[7.1]
  def change
    add_column :accounts, :max_agents, :integer unless column_exists?(:accounts, :max_agents)
    add_column :accounts, :max_inboxes, :integer unless column_exists?(:accounts, :max_inboxes)
  end
end
