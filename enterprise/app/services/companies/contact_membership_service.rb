class Companies::ContactMembershipService
  attr_reader :company

  def initialize(company:)
    @company = company
  end

  def assign(contact:, run_callbacks: true)
    sync_contact(contact, new_company_id: company.id, new_company_name: company.name, run_callbacks: run_callbacks)
  end

  def remove(contact:)
    sync_contact(contact, new_company_id: nil, new_company_name: nil, run_callbacks: true)
  end

  def sync_company_name
    Contact.connection.exec_update(
      <<~SQL.squish,
        UPDATE contacts
        SET additional_attributes = jsonb_set(COALESCE(additional_attributes, '{}'::jsonb), '{company_name}', to_jsonb($1::text), true),
            updated_at = $2
        WHERE company_id = $3
      SQL
      'Company contact company_name sync',
      [
        bind_attribute(Company, 'name', company.name),
        bind_attribute(Contact, 'updated_at', Time.current),
        bind_attribute(Contact, 'company_id', company.id)
      ]
    )
  end

  def cleanup_on_company_delete
    Contact.connection.exec_update(
      <<~SQL.squish,
        UPDATE contacts
        SET additional_attributes = COALESCE(additional_attributes, '{}'::jsonb) - 'company_name',
            updated_at = $1
        WHERE company_id = $2
      SQL
      'Company contact company_name cleanup',
      [
        bind_attribute(Contact, 'updated_at', Time.current),
        bind_attribute(Contact, 'company_id', company.id)
      ]
    )
  end

  private

  def sync_contact(contact, new_company_id:, new_company_name:, run_callbacks:)
    old_company_id = contact.company_id
    updated_additional_attributes = synced_additional_attributes(contact, new_company_name)

    return contact if old_company_id == new_company_id &&
                      contact.additional_attributes.to_h == updated_additional_attributes

    if run_callbacks
      contact.assign_attributes(company_id: new_company_id, additional_attributes: updated_additional_attributes)
      contact.save!(validate: false)
    else
      ActiveRecord::Base.transaction do
        persist_contact_membership(contact, new_company_id, updated_additional_attributes)
        sync_company_counters(old_company_id, new_company_id)
      end

      contact.company_id = new_company_id
      contact.additional_attributes = updated_additional_attributes
      contact.clear_changes_information
    end

    contact
  end

  def sync_company_counters(old_company_id, new_company_id)
    return if old_company_id == new_company_id

    update_contacts_count(old_company_id, -1) if old_company_id.present?
    update_contacts_count(new_company_id, 1) if new_company_id.present?
  end

  def persist_contact_membership(contact, company_id, additional_attributes)
    Contact.connection.exec_update(
      'UPDATE contacts SET company_id = $1, additional_attributes = $2, updated_at = $3 WHERE id = $4',
      'Company contact membership sync',
      [
        bind_attribute(Contact, 'company_id', company_id),
        bind_attribute(Contact, 'additional_attributes', additional_attributes),
        bind_attribute(Contact, 'updated_at', Time.current),
        bind_attribute(Contact, 'id', contact.id)
      ]
    )
  end

  def update_contacts_count(company_id, value)
    Company.connection.exec_update(
      'UPDATE companies SET contacts_count = COALESCE(contacts_count, 0) + $1 WHERE id = $2',
      'Company contacts count sync',
      [
        bind_attribute(Company, 'contacts_count', value),
        bind_attribute(Company, 'id', company_id)
      ]
    )
  end

  def bind_attribute(model, attribute, value)
    ActiveRecord::Relation::QueryAttribute.new(attribute, value, model.type_for_attribute(attribute))
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
