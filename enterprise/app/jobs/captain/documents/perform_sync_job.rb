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
      last_sync_attempted_at: Time.current,
      metadata: (document.metadata || {}).except('sync_step')
    )
    raise
  end

  private

  def acquire_sync_lock(document)
    acquired = false
    document.with_lock do
      next if document.sync_syncing?

      document.update!(
        sync_status: :syncing,
        last_sync_attempted_at: Time.current
      )
      acquired = true
    end
    acquired
  end
end
