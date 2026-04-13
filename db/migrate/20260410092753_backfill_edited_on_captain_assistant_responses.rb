class BackfillEditedOnCaptainAssistantResponses < ActiveRecord::Migration[7.0]
  def up
    # rubocop:disable Rails/SkipsModelValidations
    # NOTE: Since there is no way of knowing currently which FAQs were edited by a human
    # we use a heuristic based on time passed between created_at and updated_at.
    # 15 days is arbitrary but seems reasonable for a user to go back and edit an FAQ.
    Captain::AssistantResponse
      .where('updated_at - created_at > interval ?', '15 days')
      .update_all(edited: true)
    # rubocop:enable Rails/SkipsModelValidations
  end

  def down
    # no-op: rolling back migration of edited column will drop the edited column entirely
  end
end
