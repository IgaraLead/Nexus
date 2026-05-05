# frozen_string_literal: true

class CreateChannelBaileysWhatsapp < ActiveRecord::Migration[7.1]
  def up
    unless table_exists?(:channel_baileys_whatsapp)
      create_table :channel_baileys_whatsapp do |t|
        t.integer :account_id, null: false
        t.string :phone_number
        t.string :session_id, null: false
        t.string :session_status, default: 'disconnected'
        t.jsonb :provider_config, default: {}
        t.datetime :last_connected_at
        t.timestamps
      end
    end

    add_index :channel_baileys_whatsapp, :account_id unless index_exists?(:channel_baileys_whatsapp, :account_id)
    unless index_exists?(:channel_baileys_whatsapp, :session_id, unique: true)
      add_index :channel_baileys_whatsapp, :session_id, unique: true
    end
    add_index :channel_baileys_whatsapp, :phone_number unless index_exists?(:channel_baileys_whatsapp, :phone_number)
  end

  def down
    drop_table :channel_baileys_whatsapp if table_exists?(:channel_baileys_whatsapp)
  end
end
