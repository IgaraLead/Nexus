class Companies::ContactMembershipService
  attr_reader :company

  def initialize(company:)
    @company = company
  end

  def assign(contact:)
    sync_contact(contact, new_company_id: company.id, new_company_name: company.name)
  end

  def remove(contact:)
    sync_contact(contact, new_company_id: nil, new_company_name: nil)
  end

  def sync_company_name
    sync_contacts(company.contacts, new_company_id: company.id, new_company_name: company.name)
  end

  def cleanup_on_company_delete
    sync_contacts(company.contacts, new_company_id: nil, new_company_name: nil)
  end

  private

  def sync_contacts(scope, new_company_id:, new_company_name:)
    scope.find_each do |contact|
      sync_contact(contact, new_company_id: new_company_id, new_company_name: new_company_name)
    end
  end

  def sync_contact(contact, new_company_id:, new_company_name:)
    old_company_id = contact.company_id
    updated_additional_attributes = synced_additional_attributes(contact, new_company_name)

    return contact if old_company_id == new_company_id &&
                      contact.additional_attributes.to_h == updated_additional_attributes

    contact.assign_attributes(
      company_id: new_company_id,
      additional_attributes: updated_additional_attributes
    )
    contact.save!(validate: false)

    contact
  end

  def synced_additional_attributes(contact, company_name)
    attributes = contact.additional_attributes.to_h.deep_dup

    if company_name.present?
      attributes['company_name'] = company_name
    else
      attributes.delete('company_name')
    end

    attributes
  end
end
