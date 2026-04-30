require 'rails_helper'

describe Whatsapp::CallPermissionReplyService do
  let(:account) { create(:account) }
  let(:channel) do
    create(:channel_whatsapp, provider: 'whatsapp_cloud', account: account,
                              validate_provider_config: false, sync_templates: false)
  end
  let(:inbox) { channel.inbox }
  let(:contact) { create(:contact, account: account, phone_number: '+15550001111') }
  let!(:contact_inbox) { create(:contact_inbox, contact: contact, inbox: inbox, source_id: '15550001111') }
  let!(:conversation) do
    create(:conversation, account: account, inbox: inbox, contact: contact, contact_inbox: contact_inbox, status: :open,
                          additional_attributes: { 'call_permission_requested_at' => Time.zone.now.to_i })
  end

  before do
    channel.provider_config = channel.provider_config.merge('calling_enabled' => true)
    channel.save!
  end

  def reply_params(response:)
    {
      entry: [{ changes: [{ value: { messages: [{ from: '15550001111', type: 'interactive',
                                                  interactive: { type: 'call_permission_reply',
                                                                 call_permission_reply: { response: response,
                                                                                          is_permanent: false } } }] } }] }]
    }
  end

  it 'clears the requested-at flag and broadcasts voice_call.permission_granted on accept' do
    allow(ActionCable.server).to receive(:broadcast)

    described_class.new(inbox: inbox, params: reply_params(response: 'accept')).perform

    expect(conversation.reload.additional_attributes).not_to include('call_permission_requested_at')
    expect(ActionCable.server).to have_received(:broadcast).with(
      "account_#{account.id}",
      hash_including(event: 'voice_call.permission_granted',
                     data: hash_including(conversation_id: conversation.id))
    )
  end

  it 'is a no-op when the contact rejected the request' do
    allow(ActionCable.server).to receive(:broadcast)

    described_class.new(inbox: inbox, params: reply_params(response: 'reject')).perform

    expect(conversation.reload.additional_attributes).to include('call_permission_requested_at')
    expect(ActionCable.server).not_to have_received(:broadcast)
  end

  it 'is a no-op when calling is disabled on the channel' do
    channel.provider_config = channel.provider_config.merge('calling_enabled' => false)
    channel.save!
    allow(ActionCable.server).to receive(:broadcast)

    described_class.new(inbox: inbox, params: reply_params(response: 'accept')).perform

    expect(ActionCable.server).not_to have_received(:broadcast)
  end

  it 'targets the conversation that requested permission, not just any open one' do
    other_open = create(:conversation, account: account, inbox: inbox, contact: contact, contact_inbox: contact_inbox,
                                       status: :open, additional_attributes: {})
    allow(ActionCable.server).to receive(:broadcast)

    described_class.new(inbox: inbox, params: reply_params(response: 'accept')).perform

    expect(other_open.reload.additional_attributes).to eq({})
    expect(ActionCable.server).to have_received(:broadcast).with(
      "account_#{account.id}",
      hash_including(data: hash_including(conversation_id: conversation.id))
    )
  end
end
