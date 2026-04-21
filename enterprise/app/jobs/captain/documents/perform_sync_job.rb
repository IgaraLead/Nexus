class Captain::Documents::PerformSyncJob < ApplicationJob
  queue_as :low

  # Permanent errors (404, 403, empty content) — no point retrying, discard immediately.
  # Document is already marked failed by SyncService before the exception reaches here.
  discard_on(Captain::Documents::SyncService::PermanentSyncError)

  # TransientSyncError comes from two sources:
  #   - SyncService: customer site unreachable (timeouts, TLS errors, 5xx, connection drops)
  #   - perform: lock contention when another worker is already (or was) syncing this document
  #
  # Wait schedule sums to ~12.5 min — deliberately longer than the 10-min stale lock threshold
  # so a dead worker's lock reliably becomes re-acquirable by the final attempt.
  #
  # The exhaustion block absorbs the exception so it doesn't propagate to Sentry — site
  # flakiness and lock contention aren't application bugs.
  retry_on(
    Captain::Documents::SyncService::TransientSyncError,
    wait: ->(executions) { [30.seconds, 2.minutes, 5.minutes, 5.minutes][executions - 1] || 5.minutes },
    attempts: 5
  ) do |job, error|
    document = job.arguments.first
    job.send(:log_sync_outcome, document, result: :transient_retry_exhausted, error_code: error.message)
  end

  def perform(document)
    start_time = Time.current
    return if document.pdf_document?
    raise Captain::Documents::SyncService::TransientSyncError, 'lock_contended' unless acquire_sync_lock(document)

    Captain::Documents::SyncService.new(document.reload).perform
  rescue Captain::Documents::SyncService::PermanentSyncError => e
    log_failure_and_raise(document, :permanent_failure, e, start_time)
  rescue Captain::Documents::SyncService::TransientSyncError => e
    log_failure_and_raise(document, :transient_failure, e, start_time)
  rescue StandardError => e
    handle_unexpected_failure(document, e, start_time)
  end

  private

  def log_sync_outcome(document, **fields)
    payload = {
      document_id: document.id,
      account_id: document.account_id,
      assistant_id: document.assistant_id
    }.merge(fields)
    Rails.logger.info("[Captain::Documents::PerformSyncJob] #{payload.to_json}")
  end

  def log_failure_and_raise(document, result, error, start_time)
    log_sync_outcome(document, result: result, error_code: error.message,
                               duration_ms: duration_ms_since(start_time))
    raise error
  end

  def handle_unexpected_failure(document, error, start_time)
    document.update!(
      sync_status: :failed,
      last_sync_error_code: 'sync_error',
      last_sync_exception_class: error.class.name,
      last_sync_attempted_at: Time.current
    )
    log_sync_outcome(document, result: :unexpected_failure, error_code: 'sync_error',
                               exception_class: error.class.name,
                               duration_ms: duration_ms_since(start_time))
    ChatwootExceptionTracker.new(error, account: document.account).capture_exception
  end

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

  def duration_ms_since(start_time)
    ((Time.current - start_time) * 1000).round
  end
end
