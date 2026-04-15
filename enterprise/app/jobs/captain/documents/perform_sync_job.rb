class Captain::Documents::PerformSyncJob < ApplicationJob
  queue_as :low

  def perform(document)
    return if document.pdf_document?
    return unless acquire_sync_lock(document)

    Captain::Documents::SyncService.new(document.reload).perform
  rescue StandardError
    document.update!(
      sync_status: :failed,
      last_sync_error_code: 'sync_error',
      last_sync_attempted_at: Time.current
    )
    raise
  end

  private

  def acquire_sync_lock(document)
    acquired = false
    document.with_lock do
      next if document.sync_syncing? && !sync_stale?(document)

      document.update!(
        sync_status: :syncing,
        last_sync_attempted_at: Time.current
      )
      acquired = true
    end
    acquired
  end

  # A single page fetch + fingerprint compare should complete in seconds.
  # 10 minutes is generous headroom — if still "syncing" after that, the worker likely died mid-run.
  def sync_stale?(document)
    document.last_sync_attempted_at.present? && document.last_sync_attempted_at < 10.minutes.ago
  end
end
