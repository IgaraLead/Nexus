require 'rails_helper'

RSpec.describe Companies::ContactMembershipService, type: :service do
  describe '#assign' do
    it 'updates company membership and dispatches contact update events for manual changes' do
      company = create(:company)
      contact = create(:contact, account: company.account)
      allow(Rails.configuration.dispatcher).to receive(:dispatch)

      described_class.new(company: company).assign(contact: contact)

      expect(contact.reload.company).to eq(company)
      expect(contact.additional_attributes['company_name']).to eq(company.name)
      expect(company.reload.contacts_count).to eq(1)
      expect(Rails.configuration.dispatcher).to have_received(:dispatch).with(
        Contact::CONTACT_UPDATED,
        anything,
        hash_including(contact: contact, changed_attributes: hash_including('company_id'))
      )
    end

    it 'updates company membership for automatic legacy contacts with invalid attributes' do
      account = create(:account)
      company = create(:company, account: account)
      contact = create(:contact, account: account, email: 'legacy@example.com')
      contact.email = 'legacy-invalid-email'
      contact.save!(validate: false)

      described_class.new(company: company).assign(contact: contact, run_callbacks: false)

      contact.reload
      expect(contact.company).to eq(company)
      expect(contact.additional_attributes['company_name']).to eq(company.name)
      expect(company.reload.contacts_count).to eq(1)
    end

    it 'keeps company counters correct when reassigning a contact' do
      old_company = create(:company)
      new_company = create(:company, account: old_company.account)
      contact = create(:contact, account: old_company.account, company: old_company)

      described_class.new(company: new_company).assign(contact: contact)

      expect(contact.reload.company).to eq(new_company)
      expect(old_company.reload.contacts_count).to eq(0)
      expect(new_company.reload.contacts_count).to eq(1)
    end
  end

  describe '#sync_company_name' do
    it 'updates linked contact company names in bulk' do
      company = create(:company, name: 'Old name')
      contact = create(:contact, account: company.account, company: company, additional_attributes: { 'company_name' => 'Old name' })
      company.update!(name: 'New name')

      described_class.new(company: company).sync_company_name

      expect(contact.reload.additional_attributes['company_name']).to eq('New name')
    end
  end

  describe '#cleanup_on_company_delete' do
    it 'removes stored company names from linked contacts' do
      company = create(:company)
      contact = create(:contact, account: company.account, company: company, additional_attributes: { 'company_name' => company.name })

      described_class.new(company: company).cleanup_on_company_delete

      expect(contact.reload.additional_attributes).not_to have_key('company_name')
    end
  end
end
