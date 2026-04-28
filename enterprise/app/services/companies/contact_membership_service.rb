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
    sync_contacts(company.contacts.select(:id, :company_id, :additional_attributes), new_company_id: company.id, new_company_name: company.name)
  end

  def cleanup_on_company_delete
    sync_contacts(company.contacts.select(:id, :company_id, :additional_attributes), new_company_id: nil, new_company_name: nil)
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

    # rubocop:disable Rails/SkipsModelValidations
    contact.update_columns(
      company_id: new_company_id,
      additional_attributes: updated_additional_attributes,
      updated_at: Time.current
    )
    # rubocop:enable Rails/SkipsModelValidations

    sync_contact_counters(old_company_id: old_company_id, new_company_id: new_company_id)
    contact
  end

  def sync_contact_counters(old_company_id:, new_company_id:)
    return if old_company_id == new_company_id

    # rubocop:disable Rails/SkipsModelValidations
    Company.decrement_counter(:contacts_count, old_company_id) if old_company_id.present?
    Company.increment_counter(:contacts_count, new_company_id) if new_company_id.present?
    # rubocop:enable Rails/SkipsModelValidations
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
