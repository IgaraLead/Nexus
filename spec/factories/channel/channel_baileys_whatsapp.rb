# frozen_string_literal: true

FactoryBot.define do
  factory :channel_baileys_whatsapp, class: 'Channel::BaileysWhatsapp' do
    account
    provider_config { {} }
    session_status { 'disconnected' }

    after(:create) do |channel|
      create(:inbox, channel: channel, account: channel.account)
    end
  end
end
