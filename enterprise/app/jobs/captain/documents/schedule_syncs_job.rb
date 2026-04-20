class Captain::Documents::ScheduleSyncsJob < ApplicationJob
  queue_as :scheduled_jobs

  def perform
    Account.joins(:captain_documents).distinct.find_each do |account|
      interval = account.captain_document_sync_interval
      next if interval.nil?

      enqueue_due_documents(account, interval)
    end
  end

  private

  def enqueue_due_documents(account, interval)
    account.captain_documents
           .where(status: :available)
           .where('sync_status IS NULL OR sync_status != ?', Captain::Document.sync_statuses[:syncing])
           .where('last_sync_attempted_at IS NULL OR last_sync_attempted_at < ?', interval.ago)
           .find_each do |document|
      next if document.pdf_document?

      Captain::Documents::PerformSyncJob.perform_later(document, triggered_by: 'scheduler')
    end
  end
end
