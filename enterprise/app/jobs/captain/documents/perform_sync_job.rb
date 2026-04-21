class Captain::Documents::PerformSyncJob < ApplicationJob
  queue_as :low

  # A single page fetch + fingerprint compare should complete in seconds.
  # 10 minutes is generous headroom — if still "syncing" after that, the worker likely died mid-run.
  # Shared with ScheduleSyncsJob so stale locks are re-enqueued at the same threshold.
  STALE_LOCK_THRESHOLD = 10.minutes

  # Safety net for anything we didn't rescue by name — parser bugs, ActiveRecord blips,
  # random infra issues. Three attempts lets a real hiccup recover without Sidekiq's
  # default 25 retries piling up for what's actually a deterministic bug.
  # Goes first because retry_on handlers dispatch bottom-to-top.
  retry_on StandardError, wait: 5.seconds, attempts: 3

  # Permanent errors (404, 403, empty content) — no point retrying, discard immediately.
  # Document is already marked failed by SyncService before the exception reaches here.
  discard_on(Captain::Documents::SyncService::PermanentSyncError)

  # TransientSyncError is raised by SyncService when the customer's site is unreachable —
  # timeouts, TLS errors, 5xx, connection drops. Four attempts with backoff gives the site
  # a chance to recover before we give up.
  # Lock contention is handled locally in acquire_sync_lock, not via this retry path.
  #
  # The exhaustion block absorbs the exception so it doesn't propagate to Sentry —
  # site flakiness isn't an application bug.
  retry_on(
    Captain::Documents::SyncService::TransientSyncError,
    wait: ->(executions) { [30.seconds, 2.minutes, 5.minutes][executions - 1] || 5.minutes },
    attempts: 4
  ) do |job, error|
    document = job.arguments.first
    job.send(:log_sync_outcome, document, result: :transient_retry_exhausted, error_code: error.message)
  end

  def perform(document)
    start_time = Time.current
    return if document.pdf_document?

    lock_status = acquire_sync_lock(document)

    case lock_status
    when :already_syncing
      log_sync_outcome(document, result: :already_syncing)
      return
    when :acquired, :recovered_stale_lock
      result = Captain::Documents::SyncService.new(document.reload).perform
      log_sync_outcome(document, result: result, lock_status: lock_status, duration_ms: duration_ms_since(start_time))
    end
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
      last_sync_attempted_at: Time.current
    )
    log_sync_outcome(document, result: :unexpected_failure, error_code: 'sync_error',
                               exception_class: error.class.name,
                               duration_ms: duration_ms_since(start_time))
    ChatwootExceptionTracker.new(error, account: document.account).capture_exception
    raise error
  end

  def acquire_sync_lock(document)
    status = :already_syncing

    document.with_lock do
      if document.sync_syncing?
        next unless sync_stale?(document)

        status = :recovered_stale_lock

      else
        status = :acquired
      end

      document.update!(
        sync_status: :syncing,
        last_sync_attempted_at: Time.current
      )
    end

    status
  end

  def sync_stale?(document)
    document.last_sync_attempted_at.present? && document.last_sync_attempted_at < STALE_LOCK_THRESHOLD.ago
  end

  def duration_ms_since(start_time)
    ((Time.current - start_time) * 1000).round
  end
end
