class Captain::Documents::PerformSyncJob < ApplicationJob
  queue_as :low

  # Permanent errors (404, 403, empty content) — no point retrying, discard immediately.
  # Document is already marked failed by SyncService before the exception reaches here.
  discard_on(Captain::Documents::SyncService::PermanentSyncError)

  # Transient errors (timeouts, 5xx) — retry with backoff (4 total attempts = initial + 3 retries).
  # Wait times stay well under the 10-minute stale lock threshold to avoid conflicts.
  # On exhaustion, document is already marked failed by SyncService.
  retry_on(
    Captain::Documents::SyncService::TransientSyncError,
    wait: ->(executions) { [30.seconds, 2.minutes, 5.minutes][executions - 1] || 5.minutes },
    attempts: 4
  )

  def perform(document)
    return if document.pdf_document?
    return unless acquire_sync_lock(document)

    Captain::Documents::SyncService.new(document.reload).perform
  rescue Captain::Documents::SyncService::PermanentSyncError,
         Captain::Documents::SyncService::TransientSyncError
    # Let discard_on / retry_on handle these
    raise
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
