# frozen_string_literal: true

require 'uri'

class Baileys::SidecarAdminService
  DEFAULT_SIDECAR_URL = Baileys::ProviderService::DEFAULT_SIDECAR_URL
  DEFAULT_SIDECAR_API_KEY = Baileys::ProviderService::DEFAULT_SIDECAR_API_KEY

  def sessions
    response = get('/sessions')
    return { sessions: [], error: response['error'] } if response.is_a?(Hash) && response['error'].present?

    { sessions: Array(response['sessions']), error: nil }
  end

  def disconnect(session_id:, client_slug: nil)
    post('/sessions/disconnect', { session_id: session_id, client_slug: client_slug }.compact)
  end

  private

  def base_url
    normalize_sidecar_url(ENV.fetch('BAILEYS_SIDECAR_URL', DEFAULT_SIDECAR_URL).to_s.strip)
  end

  def normalize_sidecar_url(raw)
    return nil if raw.blank?

    candidate = raw.match?(%r{\A[a-z][a-z0-9+\-.]*://}i) ? raw : "http://#{raw}"
    uri = URI.parse(candidate)
    return nil unless uri.is_a?(URI::HTTP) || uri.is_a?(URI::HTTPS)
    return nil if uri.host.blank?

    candidate
  rescue URI::InvalidURIError
    nil
  end

  def connection
    return @connection if defined?(@connection)

    url = base_url
    @connection =
      if url.blank?
        nil
      else
        Faraday.new(url: url) do |f|
          f.request :json
          f.response :json
          f.headers['X-Api-Key'] = ENV.fetch('BAILEYS_SIDECAR_API_KEY', DEFAULT_SIDECAR_API_KEY)
          f.adapter Faraday.default_adapter
          f.options.timeout = 30
          f.options.open_timeout = 10
        end
      end
  end

  def get(path)
    conn = connection
    return { 'error' => 'Baileys sidecar URL not configured' } unless conn

    normalize_response(conn.get(path))
  rescue Faraday::Error, ArgumentError => e
    Rails.logger.error("[Baileys::SidecarAdminService] GET #{path} failed: #{e.class}: #{e.message}")
    { 'error' => e.message }
  end

  def post(path, body_hash)
    conn = connection
    return { 'error' => 'Baileys sidecar URL not configured' } unless conn

    normalize_response(conn.post(path, body_hash))
  rescue Faraday::Error, ArgumentError => e
    Rails.logger.error("[Baileys::SidecarAdminService] POST #{path} failed: #{e.class}: #{e.message}")
    { 'error' => e.message }
  end

  def normalize_response(response)
    body = response.body
    unless response.success?
      msg = body.is_a?(Hash) ? body['error'].presence || body['message'].presence : body.to_s.presence
      return { 'error' => msg || "HTTP #{response.status}" }
    end

    return body if body.is_a?(Hash)

    { 'error' => 'Unexpected response from Baileys sidecar' }
  end
end
