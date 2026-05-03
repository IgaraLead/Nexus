require 'rails_helper'

RSpec.describe Companies::ContactMembershipService, type: :service do
  describe '#assign' do
    it 'updates company membership for legacy contacts with invalid attributes' do
      account = create(:account)
      company = create(:company, account: account)
      contact = create(:contact, account: account, email: 'legacy@example.com')
      contact.email = 'legacy-invalid-email'
      contact.save!(validate: false)

      described_class.new(company: company).assign(contact: contact)

      contact.reload
      expect(contact.company).to eq(company)
      expect(contact.additional_attributes['company_name']).to eq(company.name)
      expect(company.reload.contacts_count).to eq(1)
    end

    it 'does not dispatch contact update events' do
      company = create(:company)
      contact = create(:contact, account: company.account)
      allow(Rails.configuration.dispatcher).to receive(:dispatch)

      described_class.new(company: company).assign(contact: contact)

      expect(Rails.configuration.dispatcher).not_to have_received(:dispatch).with(
        Contact::CONTACT_UPDATED,
        anything,
        anything
      )
    end
  end
end
