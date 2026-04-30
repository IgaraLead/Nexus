class Captain::Llm::AssistantActionClassifierService < Llm::BaseAiService
  include Integrations::LlmInstrumentation

  PROMPT_VERSION = 'v1_custom_xml_precedence'.freeze
  DEFAULT_MODEL = 'gpt-4.1'.freeze
  MAX_CONTEXT_MESSAGES = 10
  VALID_ACTIONS = %w[continue handoff].freeze

  def initialize(assistant:, conversation:)
    super()
    @assistant = assistant
    @conversation = conversation
    @model = DEFAULT_MODEL
    @temperature = 0.0
  end

  def classify(message_history:, assistant_response:)
    payload = classification_payload(message_history, assistant_response)
    user_prompt = classification_user_prompt(payload)

    response = instrument_llm_call(instrumentation_params(user_prompt)) do
      chat(model: @model, temperature: @temperature)
        .with_params(response_format: { type: 'json_object' })
        .with_instructions(system_prompt)
        .ask(user_prompt)
    end

    parsed = parse_response(response.content)
    normalize_response(parsed, response.content)
  rescue StandardError => e
    ChatwootExceptionTracker.new(e, account: @conversation.account).capture_exception
    Rails.logger.warn(
      "[CAPTAIN][AssistantActionClassifier] Failed for conversation #{@conversation.display_id}: #{e.class.name}: #{e.message}"
    )
    { 'action' => nil, 'action_reason' => nil, 'error' => e.message, 'model' => @model, 'prompt_version' => PROMPT_VERSION }
  end

  private

  def classification_payload(message_history, assistant_response)
    normalized_messages = normalize_messages(message_history)

    {
      'account_custom_instructions' => account_custom_instructions,
      'conversation_context' => context_messages(normalized_messages),
      'current_user_message' => current_user_message(normalized_messages),
      'assistant_response_to_classify' => assistant_response.to_s
    }
  end

  def classification_user_prompt(payload)
    <<~PROMPT
      <account_custom_instructions>
      #{payload['account_custom_instructions']}
      </account_custom_instructions>

      <conversation_context>
      #{payload['conversation_context'].to_json}
      </conversation_context>

      <current_user_message>
      #{payload['current_user_message']}
      </current_user_message>

      <assistant_response_to_classify>
      #{payload['assistant_response_to_classify']}
      </assistant_response_to_classify>
    PROMPT
  end

  def normalize_messages(message_history)
    message_history.filter_map do |message|
      role = message[:role] || message['role']
      next if role.blank?

      { role: role.to_s, content: normalize_content(message[:content] || message['content']) }
    end
  end

  def normalize_content(content)
    return content if content.is_a?(String)
    return content.filter_map { |part| part[:text] || part['text'] if text_part?(part) }.join("\n") if content.is_a?(Array)

    content.to_s
  end

  def text_part?(part)
    return false unless part.is_a?(Hash)

    (part[:type] || part['type']).to_s == 'text'
  end

  def current_user_message(messages)
    messages.reverse.find { |message| message[:role] == 'user' }&.dig(:content).to_s
  end

  def context_messages(messages)
    current_user_index = messages.rindex { |message| message[:role] == 'user' }
    prior_messages = current_user_index ? messages[0...current_user_index] : messages
    prior_messages.last(MAX_CONTEXT_MESSAGES)
  end

  def account_custom_instructions
    @assistant.config['instructions'].to_s
  end

  def parse_response(content)
    JSON.parse(sanitize_json_response(content))
  rescue JSON::ParserError, TypeError
    {}
  end

  def normalize_response(parsed, raw_content)
    action = parsed['action'].to_s
    reason = parsed['action_reason'].to_s
    return invalid_response(raw_content) unless VALID_ACTIONS.include?(action)

    {
      'action' => action,
      'action_reason' => reason.presence,
      'raw_response' => raw_content,
      'model' => @model,
      'prompt_version' => PROMPT_VERSION
    }
  end

  def invalid_response(raw_content)
    {
      'action' => nil,
      'action_reason' => nil,
      'raw_response' => raw_content,
      'error' => 'invalid_classifier_response',
      'model' => @model,
      'prompt_version' => PROMPT_VERSION
    }
  end

  def instrumentation_params(user_prompt)
    {
      span_name: 'llm.captain.assistant_action_classifier',
      model: @model,
      temperature: @temperature,
      account_id: @conversation.account_id,
      conversation_id: @conversation.display_id,
      feature_name: 'assistant_action_classifier',
      messages: [
        { role: 'system', content: system_prompt },
        { role: 'user', content: user_prompt }
      ],
      metadata: {
        assistant_id: @assistant.id,
        channel_type: @conversation.inbox&.channel_type,
        prompt_version: PROMPT_VERSION,
        source: 'v1_response_builder'
      }
    }
  end

  def system_prompt
    Captain::Llm::SystemPromptsService.assistant_action_classifier
  end
end
