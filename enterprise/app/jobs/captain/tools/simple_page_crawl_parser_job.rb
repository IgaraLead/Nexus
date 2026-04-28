class Captain::Tools::SimplePageCrawlParserJob < ApplicationJob
  queue_as :low

  def perform(assistant_id:, page_link:)
    assistant = Captain::Assistant.find(assistant_id)
    account = assistant.account

    if limit_exceeded?(account)
      Rails.logger.info("Document limit exceeded for #{assistant_id}")
      return
    end

    crawler = Captain::Tools::SimplePageCrawlService.new(page_link)
    normalized_link = normalize_link(page_link)
    document = assistant.documents.find_or_initialize_by(external_link: normalized_link)

    unless crawler.success?
      mark_failed!(document, crawler.status_code) if document.persisted?
      raise "Failed to fetch page: #{page_link}"
    end

    persist_document!(document, normalized_link, crawler)
  rescue StandardError => e
    raise "Failed to parse data: #{page_link} #{e.message}"
  end

  private

  def persist_document!(document, normalized_link, crawler)
    document.update!(
      external_link: normalized_link,
      name: (crawler.page_title || '')[0..254],
      content: (crawler.body_markdown || '')[0..14_999],
      status: :available,
      **synced_attributes
    )
  end

  def synced_attributes
    {
      sync_status: :synced,
      last_synced_at: Time.current,
      last_sync_attempted_at: Time.current,
      last_sync_error_code: nil
    }
  end

  def mark_failed!(document, status_code)
    document.update!(
      sync_status: :failed,
      last_sync_error_code: http_error_code(status_code),
      last_sync_attempted_at: Time.current
    )
  end

  def http_error_code(status_code)
    case status_code
    when 404 then 'not_found'
    when 401, 403 then 'access_denied'
    when 408, 504 then 'timeout'
    else 'fetch_failed'
    end
  end

  def normalize_link(raw_link)
    raw_link.to_s.delete_suffix('/')
  end

  def limit_exceeded?(account)
    limits = account.usage_limits[:captain][:documents]
    limits[:current_available].negative? || limits[:current_available].zero?
  end
end
