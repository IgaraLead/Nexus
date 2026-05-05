# frozen_string_literal: true

class Baileys::ProviderService
  DEFAULT_SIDECAR_URL = "http://baileys:3500"
  DEFAULT_SIDECAR_API_KEY = "nexus-internal-baileys"

  attr_reader :channel

  def initialize(channel:)
    @channel = channel
  end

  def send_message(phone_number, message)
    jid = normalize_jid(phone_number)

    payload = if message.attachments.present?
                build_media_payload(jid, message)
              else
                build_text_payload(jid, message)
              end

    response = post('/messages/send', payload)
    return unless response.is_a?(Hash) && response['key'].present?

    response['key']['id']
  end

  def request_qr_code(force: false, sync_full_history: true, import_groups: false)
    response = post(
      "/sessions/start",
      {
        session_id: channel.session_id,
        force: force,
        sync_full_history: sync_full_history,
        import_groups: import_groups
      }
    )
    if response.is_a?(Hash) && response['error'].blank?
      channel.update!(session_status: 'qr_pending')
    end
    response
  rescue ActiveRecord::RecordInvalid => e
    Rails.logger.warn("[Baileys::ProviderService] request_qr_code persist failed: #{e.message}")
    { 'error' => e.record.errors.full_messages.join(', ') }
  end

  def disconnect
    post('/sessions/disconnect', { session_id: channel.session_id })
  end

  def session_status
    response = get("/sessions/#{channel.session_id}/status")
    return 'unknown' unless response.is_a?(Hash)

    response['error'].present? ? 'unknown' : (response['status'] || 'unknown')
  end

  def validate_provider_config?
    base_url.present?
  end

  private

  def build_text_payload(jid, message)
    payload = {
      session_id: channel.session_id,
      jid: jid,
      message: { text: message.outgoing_content }
    }
    if message.content_attributes[:in_reply_to_external_id].present?
      payload[:quoted_message_id] =
        message.content_attributes[:in_reply_to_external_id]
    end
    payload
  end

  def build_media_payload(jid, message)
    attachment = message.attachments.first
    media_type = attachment_media_type(attachment.file_type)

    payload = {
      session_id: channel.session_id,
      jid: jid,
      message: {
        media_type => { url: attachment.download_url },
        :caption => message.outgoing_content
      }.compact
    }
    if message.content_attributes[:in_reply_to_external_id].present?
      payload[:quoted_message_id] =
        message.content_attributes[:in_reply_to_external_id]
    end
    payload
  end

  def attachment_media_type(file_type)
    case file_type
    when 'image' then :image
    when 'audio' then :audio
    when 'video' then :video
    else :document
    end
  end

  def normalize_jid(phone_number)
    number = phone_number.to_s.gsub(/[^\d]/, '')
    "#{number}@s.whatsapp.net"
  end

  def base_url
    ENV.fetch("BAILEYS_SIDECAR_URL", DEFAULT_SIDECAR_URL).to_s.strip.presence
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
          f.headers["X-Api-Key"] = ENV.fetch(
            "BAILEYS_SIDECAR_API_KEY",
            DEFAULT_SIDECAR_API_KEY
          )
          f.adapter Faraday.default_adapter
          f.options.timeout = 30
          f.options.open_timeout = 10
        end
      end
  end

  def post(path, body_hash)
    conn = connection
    unless conn
      return { "error" => "Baileys sidecar URL not configured" }
    end

    response = conn.post(path, body_hash)
    normalize_response(response)
  rescue Faraday::Error, ArgumentError => e
    Rails.logger.error("[Baileys::ProviderService] POST #{path} failed: #{e.class}: #{e.message}")
    { 'error' => e.message }
  end

  def get(path)
    conn = connection
    unless conn
      return { "error" => "Baileys sidecar URL not configured" }
    end

    response = conn.get(path)
    normalize_response(response)
  rescue Faraday::Error, ArgumentError => e
    Rails.logger.error("[Baileys::ProviderService] GET #{path} failed: #{e.class}: #{e.message}")
    { 'error' => e.message }
  end

  def normalize_response(response)
    body = response.body
    unless response.success?
      msg =
        if body.is_a?(Hash)
          body['error'].presence || body['message'].presence
        else
          body.to_s.presence
        end
      return { 'error' => msg || "HTTP #{response.status}" }
    end

    return body if body.is_a?(Hash)

    { 'error' => 'Unexpected response from Baileys sidecar' }
  end
end
