require 'agents'

class Captain::Tools::HttpTool < Agents::Tool
  MAX_RESPONSE_SIZE = 1.megabyte
  OPEN_TIMEOUT = 10
  READ_TIMEOUT = 30

  def initialize(assistant, custom_tool)
    @assistant = assistant
    @custom_tool = custom_tool
    super()
  end

  def active?
    @custom_tool.enabled?
  end

  def perform(tool_context, **params)
    url = @custom_tool.build_request_url(params)
    body = @custom_tool.build_request_body(params)

    response_body = execute_http_request(url, body, tool_context)
    @custom_tool.format_response(response_body)
  rescue StandardError => e
    Rails.logger.error("HttpTool execution error for #{@custom_tool.slug}: #{e.class} - #{e.message}")
    'An error occurred while executing the request'
  end

  private

  def execute_http_request(url, body, tool_context)
    response_body = nil

    SafeFetch.fetch(
      url,
      method: @custom_tool.http_method,
      body: body,
      max_bytes: MAX_RESPONSE_SIZE,
      open_timeout: OPEN_TIMEOUT,
      read_timeout: READ_TIMEOUT,
      headers: request_headers(tool_context, body),
      http_basic_authentication: @custom_tool.build_basic_auth_credentials,
      validate_content_type: false
    ) do |response|
      response_body = response.tempfile.read
    ensure
      response.close!
    end

    response_body
  end

  def request_headers(tool_context, body)
    headers = @custom_tool.build_auth_headers.merge(@custom_tool.build_metadata_headers(tool_context&.state || {}))
    headers['Content-Type'] = 'application/json' if @custom_tool.http_method == 'POST' && body.present?
    headers
  end
end
