class Captain::Llm::WidgetTaglineService < Captain::BaseTaskService
  pattr_initialize [:account!]

  def perform
    response = make_api_call(model: tagline_model, messages: messages)
    return response if response[:error]

    response.merge(message: response[:message].to_s.strip)
  end

  private

  def messages
    [
      { role: 'system', content: system_prompt },
      { role: 'user', content: user_prompt }
    ]
  end

  def system_prompt
    <<~PROMPT
      You write a single short tagline for a company's customer-support chat widget.
      Constraints: max 60 characters, plain text, no surrounding quotes, no emoji,
      no trailing punctuation. Reply with the tagline only.
    PROMPT
  end

  def user_prompt
    parts = [
      "Company: #{account.name}",
      ("Title: #{brand_info[:title]}" if brand_info[:title].present?),
      ("Description: #{brand_info[:description]}" if brand_info[:description].present?),
      ("Slogan: #{brand_info[:slogan]}" if brand_info[:slogan].present?),
      ("Industries: #{industries_text}" if industries_text.present?)
    ].compact
    parts.join("\n")
  end

  def brand_info
    @brand_info ||= (account.custom_attributes['brand_info'] || {}).deep_symbolize_keys
  end

  def industries_text
    Array(brand_info[:industries]).filter_map { |i| i.is_a?(Hash) ? i[:industry] : i }.join(', ').presence
  end

  def event_name
    'widget_tagline'
  end

  def llm_credential
    @llm_credential ||= system_llm_credential
  end

  def captain_tasks_enabled?
    true
  end

  def tagline_model
    @tagline_model ||= InstallationConfig.find_by(name: 'CAPTAIN_OPEN_AI_MODEL')&.value.presence || GPT_MODEL
  end

  def build_follow_up_context?
    false
  end
end
