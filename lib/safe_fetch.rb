require 'ssrf_filter'

# rubocop:disable Metrics/ModuleLength
module SafeFetch
  DEFAULT_ALLOWED_CONTENT_TYPE_PREFIXES = %w[image/ video/ audio/].freeze
  DEFAULT_ALLOWED_CONTENT_TYPES = %w[
    text/csv
    text/plain
    text/rtf
    application/json
    application/pdf
    application/zip
    application/x-7z-compressed
    application/vnd.rar
    application/x-tar
    application/msword
    application/vnd.ms-excel
    application/vnd.ms-powerpoint
    application/rtf
    application/vnd.oasis.opendocument.text
    application/vnd.openxmlformats-officedocument.presentationml.presentation
    application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
    application/vnd.openxmlformats-officedocument.wordprocessingml.document
  ].freeze
  DEFAULT_SENSITIVE_HEADERS = %w[authorization cookie].freeze
  DEFAULT_OPEN_TIMEOUT = 2
  DEFAULT_READ_TIMEOUT = 20
  DEFAULT_MAX_BYTES_FALLBACK_MB = 40

  Result = Data.define(:tempfile, :filename, :content_type) do
    def original_filename
      filename
    end

    def close!
      tempfile.close! if tempfile.respond_to?(:close!)
    end
  end

  class Error < StandardError; end
  class InvalidUrlError < Error; end
  class UnsafeUrlError < Error; end
  class FetchError < Error; end
  class HttpError < Error; end
  class FileTooLargeError < Error; end
  class UnsupportedContentTypeError < Error; end
  class UnsupportedMethodError < Error; end

  # rubocop:disable Metrics/MethodLength, Metrics/ParameterLists
  def self.fetch(url,
                 method: :get,
                 body: nil,
                 max_bytes: nil,
                 headers: nil,
                 http_basic_authentication: nil,
                 allowed_content_type_prefixes: DEFAULT_ALLOWED_CONTENT_TYPE_PREFIXES,
                 allowed_content_types: DEFAULT_ALLOWED_CONTENT_TYPES,
                 validate_content_type: true)
    raise ArgumentError, 'block required' unless block_given?

    effective_max_bytes = max_bytes || default_max_bytes
    uri = parse_and_validate_url!(url)
    filename = filename_for(uri)
    tempfile = Tempfile.new('chatwoot-safe-fetch', binmode: true)

    response = stream_to_tempfile(
      url,
      method,
      body,
      tempfile,
      effective_max_bytes,
      headers,
      http_basic_authentication,
      allowed_content_type_prefixes,
      allowed_content_types,
      validate_content_type
    )
    raise HttpError, "#{response.code} #{response.message}" unless response.is_a?(Net::HTTPSuccess)

    tempfile.rewind
    yield Result.new(
      tempfile: duplicate_tempfile(tempfile),
      filename: filename,
      content_type: normalize_content_type(response['content-type'])
    )
  rescue SsrfFilter::InvalidUriScheme, URI::InvalidURIError => e
    raise InvalidUrlError, e.message
  rescue SsrfFilter::Error, Resolv::ResolvError => e
    raise UnsafeUrlError, e.message
  rescue Net::OpenTimeout, Net::ReadTimeout, SocketError, OpenSSL::SSL::SSLError => e
    raise FetchError, e.message
  ensure
    tempfile&.close!
  end
  # rubocop:enable Metrics/MethodLength, Metrics/ParameterLists

  class << self
    private

    # rubocop:disable Metrics/MethodLength, Metrics/ParameterLists
    def stream_to_tempfile(url, method, body, tempfile, max_bytes, headers, http_basic_authentication,
                           allowed_content_type_prefixes, allowed_content_types, validate_content_type)
      response = nil
      bytes_written = 0

      http_method = normalize_method(method)

      SsrfFilter.public_send(
        http_method,
        url,
        headers: headers,
        body: body,
        request_proc: request_proc(http_basic_authentication),
        sensitive_headers: sensitive_headers(headers),
        http_options: { open_timeout: DEFAULT_OPEN_TIMEOUT, read_timeout: DEFAULT_READ_TIMEOUT }
      ) do |res|
        response = res
        next unless res.is_a?(Net::HTTPSuccess)

        if validate_content_type && !allowed_content_type?(res['content-type'], allowed_content_type_prefixes, allowed_content_types)
          raise UnsupportedContentTypeError, "content-type not allowed: #{res['content-type']}"
        end

        res.read_body do |chunk|
          bytes_written += chunk.bytesize
          raise FileTooLargeError, "exceeded #{max_bytes} bytes" if bytes_written > max_bytes

          tempfile.write(chunk)
        end
      end

      response
    end
    # rubocop:enable Metrics/MethodLength, Metrics/ParameterLists

    def filename_for(uri)
      File.basename(uri.path).presence || "download-#{Time.current.to_i}-#{SecureRandom.hex(4)}"
    end

    def duplicate_tempfile(tempfile)
      duplicated = tempfile.dup
      duplicated.rewind
      duplicated
    end

    def default_max_bytes
      limit_mb = GlobalConfigService.load('MAXIMUM_FILE_UPLOAD_SIZE', DEFAULT_MAX_BYTES_FALLBACK_MB).to_i
      limit_mb = DEFAULT_MAX_BYTES_FALLBACK_MB if limit_mb <= 0
      limit_mb.megabytes
    end

    def request_proc(http_basic_authentication)
      return if http_basic_authentication.blank?

      proc { |request| request.basic_auth(*http_basic_authentication) }
    end

    def sensitive_headers(headers)
      DEFAULT_SENSITIVE_HEADERS | Array(headers).map { |header, _| header.to_s }
    end

    def parse_and_validate_url!(url)
      uri = URI.parse(url)
      raise InvalidUrlError, 'scheme must be http or https' unless uri.is_a?(URI::HTTP) || uri.is_a?(URI::HTTPS)
      raise InvalidUrlError, 'missing host' if uri.host.blank?

      uri
    end

    def normalize_method(method)
      http_method = method.to_s.downcase.to_sym
      return http_method if SsrfFilter::VERB_MAP.key?(http_method)

      raise UnsupportedMethodError, "unsupported method: #{method}"
    end

    def normalize_content_type(value)
      value.to_s.split(';').first&.strip&.downcase
    end

    def allowed_content_type?(value, prefixes, content_types)
      mime = normalize_content_type(value)
      return false if mime.blank?

      Array(prefixes).any? { |prefix| mime.start_with?(prefix) } || Array(content_types).include?(mime)
    end
  end
end
# rubocop:enable Metrics/ModuleLength
