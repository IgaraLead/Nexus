class Captain::Documents::ScheduleSyncsJob < ApplicationJob
  queue_as :scheduled_jobs

  PER_ACCOUNT_HOURLY_CAP = 50
  GLOBAL_HOURLY_CAP = 1000
  SYNC_STALE_TIMEOUT = 2.hours

  def perform
    @remaining_global_capacity = GLOBAL_HOURLY_CAP

    Account.joins(:captain_documents).distinct.find_each do |account|
      break if @remaining_global_capacity <= 0
      next unless account.feature_enabled?('captain_document_auto_sync')

      interval = account.captain_document_sync_interval
      next unless interval

      enqueue_due_documents(account, interval)
    end
  end

  private

  def enqueue_due_documents(account, interval)
    syncing = Captain::Document.sync_statuses[:syncing]
    stale_cutoff = SYNC_STALE_TIMEOUT.ago
    per_account_limit = [PER_ACCOUNT_HOURLY_CAP, @remaining_global_capacity].min

    account.captain_documents.syncable.where(status: :available).where(
      'last_sync_attempted_at IS NULL OR last_sync_attempted_at < ? OR (sync_status = ? AND last_sync_attempted_at < ?)',
      interval.ago, syncing, stale_cutoff
    ).limit(per_account_limit).each do |document|
      next unless document.syncable?

      # Reserve the sync slot before enqueueing so later scheduler runs skip this document while the job is queued.
      document.update!(sync_status: :syncing, last_sync_attempted_at: Time.current)
      Captain::Documents::PerformSyncJob.perform_later(document)
      @remaining_global_capacity -= 1
    end
  end
end
