class Captain::Documents::SinglePageFetcher
  Result = Struct.new(:success, :title, :content, :error_code, keyword_init: true)

  CONTENT_MAX_LENGTH = 200_000
  TITLE_MAX_LENGTH = 255 # captain_documents.name is a varchar(255)

  def initialize(url)
    @url = url
  end

  def fetch
    result = firecrawl_configured? ? fetch_with_firecrawl : fetch_with_fallback
    validate_content(result)
  rescue Net::ReadTimeout, Net::OpenTimeout, Errno::ETIMEDOUT
    Result.new(success: false, error_code: 'timeout')
  rescue SocketError, Errno::ECONNREFUSED, Errno::ECONNRESET, OpenSSL::SSL::SSLError
    Result.new(success: false, error_code: 'fetch_failed')
  end

  private

  def firecrawl_configured?
    InstallationConfig.find_by(name: 'CAPTAIN_FIRECRAWL_API_KEY')&.value.present?
  end

  def fetch_with_firecrawl
    api_key = InstallationConfig.find_by!(name: 'CAPTAIN_FIRECRAWL_API_KEY').value
    response = HTTParty.post(
      'https://api.firecrawl.dev/v1/scrape',
      body: { url: @url, formats: ['markdown'], excludeTags: ['iframe'] }.to_json,
      headers: { 'Authorization' => "Bearer #{api_key}", 'Content-Type' => 'application/json' }
    )

    handle_firecrawl_response(response)
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
    content = ReverseMarkdown.convert(doc.at_xpath('//body'), unknown_tags: :bypass, github_flavored: true)

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
end
