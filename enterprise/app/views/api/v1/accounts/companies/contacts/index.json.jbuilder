json.meta do
  json.total_count @contacts_count
  json.page @current_page
end

json.payload do
  json.array! @contacts do |contact|
    json.partial! 'api/v1/models/contact', formats: [:json], resource: contact,
                                                     with_contact_inboxes: false
    json.company_id contact.company_id
    json.linked_to_current_company contact.company_id == @company.id
    if contact.company.present?
      json.company do
        json.partial! 'api/v1/accounts/companies/company', company: contact.company
      end
    else
      json.company nil
    end
  end
end
