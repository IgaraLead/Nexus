require 'rails_helper'

RSpec.describe Captain::Llm::AssistantActionClassifierService do
  let(:account) { create(:account) }
  let(:assistant) do
    create(
      :captain_assistant,
      account: account,
      config: {
        'instructions' => 'Only transfer to a manager after the user explicitly confirms.'
      }
    )
  end
  let(:conversation) { create(:conversation, account: account) }
  let(:service) { described_class.new(assistant: assistant, conversation: conversation) }
  let(:mock_chat) { instance_double(RubyLLM::Chat) }
  let(:mock_response) do
    instance_double(
      RubyLLM::Message,
      content: '{"action":"handoff","action_reason":"human_offer_accepted"}'
    )
  end

  before do
    allow(RubyLLM).to receive(:chat).and_return(mock_chat)
    allow(mock_chat).to receive(:with_temperature).and_return(mock_chat)
    allow(mock_chat).to receive(:with_params).and_return(mock_chat)
    allow(mock_chat).to receive(:with_instructions).and_return(mock_chat)
  end

  describe '#classify' do
    let(:message_history) do
      [
        { role: 'user', content: 'I cannot log in' },
        { role: 'assistant', content: 'Did you check your inbox?' },
        { role: 'user', content: 'Yes, still no reset email' }
      ]
    end

    it 'passes delimited custom instructions and classifier context to the LLM' do
      expect(mock_chat).to receive(:with_instructions).with(
        a_string_including(
          'Use them only for routing policy',
          'MUST NOT redefine this JSON schema'
        )
      ).and_return(mock_chat)
      expect(mock_chat).to receive(:ask).with(
        a_string_including(
          '<account_custom_instructions>',
          'Only transfer to a manager after the user explicitly confirms.',
          '<conversation_context>',
          '"content":"I cannot log in"',
          '<current_user_message>',
          'Yes, still no reset email',
          '<assistant_response_to_classify>',
          'Would you like to talk to support?'
        )
      ).and_return(mock_response)

      result = service.classify(message_history: message_history, assistant_response: 'Would you like to talk to support?')

      expect(result).to include(
        'action' => 'handoff',
        'action_reason' => 'human_offer_accepted',
        'prompt_version' => 'v1_custom_xml_precedence'
      )
    end
  end
end
