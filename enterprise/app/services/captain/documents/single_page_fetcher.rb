class Captain::Documents::SinglePageFetcher
  Result = Struct.new(:success, :title, :content, :error_code, keyword_init: true)

  CONTENT_MAX_LENGTH = 200_000
  FIRECRAWL_EXCLUDE_TAGS = %w[iframe .sidebar .cookie-banner [role=navigation] [role=banner] [role=contentinfo]].freeze
  TITLE_MAX_LENGTH = 255 # captain_documents.name is a varchar(255)

  def initialize(url)
    @url = url
  end

  def fetch
    result = firecrawl_configured? ? fetch_with_firecrawl : fetch_with_fallback
    validate_content(result)
  rescue Net::ReadTimeout, Net::OpenTimeout
    Result.new(success: false, error_code: 'timeout')
  rescue StandardError => e
    Result.new(success: false, error_code: classify_error(e))
  end

  private

  def firecrawl_configured?
    InstallationConfig.find_by(name: 'CAPTAIN_FIRECRAWL_API_KEY')&.value.present?
  end

  def fetch_with_firecrawl
    api_key = InstallationConfig.find_by!(name: 'CAPTAIN_FIRECRAWL_API_KEY').value
    response = HTTParty.post(
      'https://api.firecrawl.dev/v1/scrape',
      body: scrape_payload.to_json,
      headers: { 'Authorization' => "Bearer #{api_key}", 'Content-Type' => 'application/json' }
    )

    handle_firecrawl_response(response)
  end

  def scrape_payload
    {
      url: @url,
      formats: ['markdown'],
      onlyMainContent: true,
      excludeTags: FIRECRAWL_EXCLUDE_TAGS
    }
  end

  def handle_firecrawl_response(response)
    return Result.new(success: false, error_code: http_error_code(response.code)) unless response.success?

    data = response.parsed_response&.dig('data')
    Result.new(
      success: true,
      title: data&.dig('metadata', 'title')&.truncate(TITLE_MAX_LENGTH, omission: ''),
      content: data&.dig('markdown')&.truncate(CONTENT_MAX_LENGTH, omission: '')
    )
  end

  def fetch_with_fallback
    response = HTTParty.get(@url)
    return Result.new(success: false, error_code: http_error_code(response.code)) unless response.success?

    doc = Nokogiri::HTML(response.body)
    title = doc.at_xpath('//title')&.text&.strip
    main_node = doc.at_xpath('//main') || doc.at_xpath('//body')
    content = ReverseMarkdown.convert(main_node, unknown_tags: :bypass, github_flavored: true)

    Result.new(
      success: true,
      title: title&.truncate(TITLE_MAX_LENGTH, omission: ''),
      content: content&.truncate(CONTENT_MAX_LENGTH, omission: '')
    )
  end

  def validate_content(result)
    return result unless result.success && result.content.blank?

    Result.new(success: false, error_code: 'content_empty')
  end

  def http_error_code(status_code)
    case status_code
    when 404 then 'not_found'
    when 401, 403 then 'access_denied'
    when 408, 504 then 'timeout'
    else 'fetch_failed'
    end
  end

  def classify_error(error)
    case error
    when HTTParty::ResponseError
      http_error_code(error.response&.code.to_i)
    else
      'fetch_failed'
    end
  end
end
