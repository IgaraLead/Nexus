# frozen_string_literal: true

require 'uri'

# rubocop:disable Metrics/ClassLength
class Baileys::ProviderService
  DEFAULT_SIDECAR_URL = 'http://baileys:3500'
  DEFAULT_SIDECAR_API_KEY = 'nexus-internal-baileys'

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
    if response.is_a?(Hash) && response['error'].present?
      message.update!(status: :failed, external_error: response['error'])
      return
    end
    return unless response.is_a?(Hash) && response['key'].present?

    response['key']['id']
  end

  def request_qr_code(force: false, sync_full_history: true, import_groups: false)
    payload = { session_id: channel.session_id, force: force, sync_full_history: sync_full_history, import_groups: import_groups }
    response = post('/sessions/start', payload)
    update_session_status_from(response)
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

  def mark_messages_read(messages)
    keys = Array(messages).filter_map { |message| read_message_key(message) }
    return if keys.blank?

    post('/messages/read', { session_id: channel.session_id, keys: keys })
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
    add_reply_context(payload, message, jid)
    payload
  end

  def build_media_payload(jid, message)
    attachment = message.attachments.first
    media_type = attachment_media_type(attachment.file_type)
    payload = {
      session_id: channel.session_id,
      jid: jid,
      message: { media_type => media_type_content(attachment, media_type, message) }
    }
    add_reply_context(payload, message, jid)
    payload
  end

  def add_reply_context(payload, message, jid)
    quoted_message = quoted_message_payload(message, jid)
    return if quoted_message.blank?

    payload[:quoted_message_id] = quoted_message[:id]
    payload[:quoted_message] = quoted_message
  end

  def quoted_message_payload(message, jid)
    quoted = quoted_message_record(message)
    quoted_id = quoted_message_id(message, quoted)
    return if quoted_id.blank?

    {
      id: quoted_id,
      remote_jid: jid,
      from_me: quoted&.outgoing? || false,
      text: quoted&.outgoing_content || quoted&.content || ' '
    }
  end

  def quoted_message_record(message)
    in_reply_to = message.content_attributes[:in_reply_to]
    return if in_reply_to.blank?

    message.conversation.messages.find_by(id: in_reply_to)
  end

  def quoted_message_id(message, quoted)
    quoted&.source_id || message.content_attributes[:in_reply_to_external_id]
  end

  def media_type_content(attachment, media_type, message)
    download_url = attachment.download_url.sub(%r{\Ahttps?://(localhost|127\.0\.0\.1|0\.0\.0\.0):3000},
                                               ENV.fetch('BAILEYS_MEDIA_BASE_URL', 'http://rails:3000'))
    {
      url: download_url,
      caption: media_type == :audio ? nil : message.outgoing_content,
      filename: media_type == :document ? attachment.file.filename.to_s : nil,
      mimetype: %i[audio document].include?(media_type) ? attachment.file.content_type.sub('audio/mp3', 'audio/mpeg') : nil
    }.compact
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
    "#{phone_number.to_s.gsub(/[^\d]/, '')}@s.whatsapp.net"
  end

  def update_session_status_from(response)
    return unless response.is_a?(Hash) && response['error'].blank?

    status = response['qr'].present? ? 'qr_pending' : response['status']
    channel.update!(session_status: status) if %w[connecting qr_pending].include?(status)
  end

  def read_message_key(message)
    source_id = message.source_id.to_s
    remote_jid = message.conversation.contact_inbox&.source_id.to_s
    return if source_id.blank? || remote_jid.blank?

    {
      id: source_id,
      remoteJid: remote_jid,
      fromMe: false
    }
  end

  def base_url
    normalize_sidecar_url(ENV.fetch('BAILEYS_SIDECAR_URL', DEFAULT_SIDECAR_URL).to_s.strip)
  end

  # Faraday parses host:port without a scheme as URI::Generic with path nil; later code calls path.end_with? and crashes.
  def normalize_sidecar_url(raw)
    return nil if raw.blank?

    candidate =
      if raw.match?(%r{\A[a-z][a-z0-9+\-.]*://}i)
        raw
      else
        "http://#{raw}"
      end

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

  def post(path, body_hash)
    conn = connection
    return { 'error' => 'Baileys sidecar URL not configured' } unless conn

    response = conn.post(path, body_hash)
    normalize_response(response)
  rescue Faraday::Error, ArgumentError => e
    Rails.logger.error("[Baileys::ProviderService] POST #{path} failed: #{e.class}: #{e.message}")
    { 'error' => e.message }
  end

  def get(path)
    conn = connection
    return { 'error' => 'Baileys sidecar URL not configured' } unless conn

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
# rubocop:enable Metrics/ClassLength
