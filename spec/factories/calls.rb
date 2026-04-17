FactoryBot.define do
  factory :call do
    association :account
    association :inbox
    association :conversation
    association :contact
    provider { :twilio }
    direction { :incoming }
    status { 'ringing' }
    sequence(:provider_call_id) { |n| "CA#{SecureRandom.hex(15)}#{n}" }
  end
end
