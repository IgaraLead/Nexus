class Whatsapp::CallTranscriptionService < Llm::LegacyBaseOpenAiService
  WHISPER_MODEL = 'whisper-1'.freeze

  attr_reader :call, :account

  def initialize(call)
    super()
    @call = call
    @account = call.account
  end

  def perform
    return { error: 'Transcription not available' } unless can_transcribe?
    return { error: 'No recording attached' } unless call.recording.attached?

    transcribed_text = transcribe_audio
    update_call_and_message(transcribed_text)
    { success: true, transcript: transcribed_text }
  rescue Faraday::UnauthorizedError
    Rails.logger.warn('[WHATSAPP CALL] Skipping transcription: OpenAI configuration is invalid (401)')
    { error: 'OpenAI configuration is invalid' }
  end

  private

  def can_transcribe?
    account.feature_enabled?('captain_integration') &&
      account.usage_limits[:captain][:responses][:current_available].positive?
  end

  # Transcribe per-direction recordings separately when possible so lines can
  # be attributed to Customer vs Agent. Falls back to the combined recording
  # if the media server isn't available or per-side files are missing.
  def transcribe_audio
    if call.media_session_id.present?
      diarized = diarized_transcript
      return diarized if diarized.present?
    end

    transcribe_combined
  end

  def diarized_transcript
    temp_dir = Rails.root.join('tmp/uploads/call-transcriptions')
    FileUtils.mkdir_p(temp_dir)
    customer_path = File.join(temp_dir, "#{call.media_session_id}_customer.ogg")
    agent_path    = File.join(temp_dir, "#{call.media_session_id}_agent.ogg")

    client = Whatsapp::MediaServerClient.new
    File.binwrite(customer_path, client.download_recording(call.media_session_id, side: 'customer'))
    File.binwrite(agent_path,    client.download_recording(call.media_session_id, side: 'agent'))

    segments = transcribe_segments(customer_path, 'Customer') +
               transcribe_segments(agent_path, 'Agent')
    return nil if segments.empty?

    segments.sort_by { |s| s[:start] }
            .map { |s| "[#{format_ts(s[:start])}] #{s[:speaker]}: #{s[:text].strip}" }
            .reject { |line| line.end_with?(': ') }
            .join("\n")
  rescue Whatsapp::MediaServerClient::ConnectionError, Whatsapp::MediaServerClient::SessionError => e
    Rails.logger.warn "[WHATSAPP CALL] Per-side recording unavailable, falling back to combined transcription: #{e.message}"
    nil
  ensure
    FileUtils.rm_f(customer_path) if defined?(customer_path) && customer_path
    FileUtils.rm_f(agent_path)    if defined?(agent_path) && agent_path
  end

  def transcribe_segments(file_path, speaker)
    return [] unless File.exist?(file_path) && File.size(file_path).positive?

    File.open(file_path, 'rb') do |file|
      response = @client.audio.transcribe(
        parameters: {
          model: WHISPER_MODEL,
          file: file,
          temperature: 0.2,
          response_format: 'verbose_json',
          timestamp_granularities: ['segment']
        }
      )
      (response['segments'] || []).map do |seg|
        { speaker: speaker, start: seg['start'].to_f, text: seg['text'].to_s }
      end
    end
  end

  def transcribe_combined
    temp_file_path = fetch_combined_recording
    File.open(temp_file_path, 'rb') do |file|
      response = @client.audio.transcribe(
        parameters: { model: WHISPER_MODEL, file: file, temperature: 0.2 }
      )
      return response['text']
    end
  ensure
    FileUtils.rm_f(temp_file_path) if defined?(temp_file_path) && temp_file_path
  end

  def fetch_combined_recording
    blob = call.recording.blob
    temp_dir = Rails.root.join('tmp/uploads/call-transcriptions')
    FileUtils.mkdir_p(temp_dir)

    extension = extension_from_content_type(blob.content_type)
    temp_file_path = File.join(temp_dir, "#{blob.key}.#{extension}")

    File.open(temp_file_path, 'wb') do |file|
      blob.open { |blob_file| IO.copy_stream(blob_file, file) }
    end

    temp_file_path
  end

  def format_ts(seconds)
    total = seconds.to_i
    mins = total / 60
    secs = total % 60
    format('%<mins>02d:%<secs>02d', mins: mins, secs: secs)
  end

  def update_call_and_message(transcribed_text)
    return if transcribed_text.blank?

    call.update!(transcript: transcribed_text)
    account.increment_response_usage

    message = call.message
    return unless message

    data = (message.content_attributes || {}).dup
    data['data'] ||= {}
    data['data']['transcript'] = transcribed_text
    data['data']['recording_url'] = call.recording_url
    message.update!(content_attributes: data)
  end

  def extension_from_content_type(content_type)
    subtype = content_type.to_s.downcase.split(';').first.to_s.split('/').last.to_s
    { 'webm' => 'webm', 'ogg' => 'ogg', 'x-m4a' => 'm4a', 'x-wav' => 'wav', 'mpeg' => 'mp3' }.fetch(subtype, 'webm')
  end
end
