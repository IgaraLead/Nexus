class RepurposeReportV4FlagForCaptainV1ActionClassifier < ActiveRecord::Migration[7.1]
  def up
    Account.feature_captain_v1_action_classifier.find_each(batch_size: 100) do |account|
      account.disable_features(:captain_v1_action_classifier)
      account.save!(validate: false)
    end
  end
end
