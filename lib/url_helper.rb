require 'uri'

module UrlHelper
  UNREACHABLE_HOSTS = %w[0.0.0.0].freeze

  def url_valid?(url)
    url = begin
      URI.parse(url)
    rescue StandardError
      false
    end
    url.is_a?(URI::HTTP) || url.is_a?(URI::HTTPS)
  end

  def self.browser_accessible_url_options(raw_url = ENV.fetch('FRONTEND_URL', 'http://localhost:3000'))
    uri = URI.parse(raw_url)
    host = UNREACHABLE_HOSTS.include?(uri.host) ? 'localhost' : uri.host

    {
      protocol: uri.scheme,
      host: host,
      port: uri.port
    }.compact
  rescue URI::InvalidURIError
    { host: 'localhost', port: 3000, protocol: 'http' }
  end

  def self.normalize_browser_accessible_url(url)
    return url if url.blank?

    uri = URI.parse(url)
    return url unless UNREACHABLE_HOSTS.include?(uri.host)

    uri.host = 'localhost'
    uri.to_s
  rescue URI::InvalidURIError
    url
  end

  def self.normalize_audio_content_type(mimetype)
    return mimetype if mimetype.blank?

    return 'audio/ogg' if mimetype.start_with?('audio/ogg') || mimetype == 'audio/opus'

    mimetype.sub('audio/mp3', 'audio/mpeg')
  end
end
