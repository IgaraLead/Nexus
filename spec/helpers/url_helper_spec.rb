require 'rails_helper'

describe UrlHelper do
  describe '.browser_accessible_url_options' do
    it 'replaces 0.0.0.0 with localhost' do
      with_modified_env FRONTEND_URL: 'http://0.0.0.0:3000' do
        expect(described_class.browser_accessible_url_options).to eq(
          protocol: 'http', host: 'localhost', port: 3000
        )
      end
    end
  end

  describe '.normalize_browser_accessible_url' do
    it 'replaces 0.0.0.0 with localhost' do
      url = 'http://0.0.0.0:3000/rails/active_storage/blobs/audio.ogg'
      expect(described_class.normalize_browser_accessible_url(url)).to eq(
        'http://localhost:3000/rails/active_storage/blobs/audio.ogg'
      )
    end
  end

  describe '.normalize_audio_content_type' do
    it 'normalizes WhatsApp opus mime types' do
      expect(described_class.normalize_audio_content_type('audio/opus')).to eq('audio/ogg')
      expect(described_class.normalize_audio_content_type('audio/ogg; codecs=opus')).to eq('audio/ogg')
      expect(described_class.normalize_audio_content_type('audio/mpeg')).to eq('audio/mpeg')
    end
  end

  describe '#url_valid' do
    context 'when url valid called' do
      it 'return if valid url passed' do
        expect(helper.url_valid?('https://app.chatwoot.com/')).to be true
      end

      it 'return false if invalid url passed' do
        expect(helper.url_valid?('javascript:alert(document.cookie)')).to be false
      end
    end
  end
end
