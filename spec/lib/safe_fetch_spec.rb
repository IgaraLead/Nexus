require 'rails_helper'

# `SafeFetch.fetch` is a custom method that requires a block (it yields a Result);
# it is NOT `Hash#fetch`, so RuboCop's autocorrect to `fetch(url, nil)` would break the API.
# rubocop:disable Style/RedundantFetchBlock
RSpec.describe SafeFetch do
  let(:url) { 'http://example.com/image.png' }

  before do
    allow(Resolv).to receive(:getaddresses).and_call_original
    allow(Resolv).to receive(:getaddresses).with('example.com').and_return(['93.184.216.34'])
    allow(Resolv).to receive(:getaddresses).with('redirect.example.com').and_return(['93.184.216.35'])
    allow(Resolv).to receive(:getaddresses).with('cdn.example.com').and_return(['93.184.216.36'])
  end

  describe '.fetch' do
    context 'with a valid public URL serving an image' do
      before do
        stub_request(:get, url).to_return(
          status: 200,
          body: File.new(Rails.root.join('spec/assets/avatar.png')),
          headers: { 'Content-Type' => 'image/png' }
        )
      end

      it 'yields a Result with tempfile, filename, and content_type' do
        described_class.fetch(url) do |result|
          expect(result.tempfile).to be_a(Tempfile)
          expect(result.filename).to eq('image.png')
          expect(result.content_type).to eq('image/png')
          expect(result.tempfile.size).to be > 0
        end
      end

      it 'keeps the yielded tempfile readable after the block returns' do
        captured = nil
        described_class.fetch(url) { |result| captured = result.tempfile }
        expect(captured.closed?).to be false
        captured.rewind
        expect(captured.read.bytesize).to be > 0
      ensure
        captured&.close!
      end

      it 'keeps the yielded tempfile readable even when the block raises' do
        captured = nil
        expect do
          described_class.fetch(url) do |result|
            captured = result.tempfile
            raise 'boom'
          end
        end.to raise_error('boom')
        expect(captured.closed?).to be false
        captured.rewind
        expect(captured.read.bytesize).to be > 0
      ensure
        captured&.close!
      end

      it 'defaults the filename to a unique "download-<timestamp>-<hex>" when the URL has no path' do
        bare_url = 'http://example.com'
        stub_request(:get, bare_url).to_return(
          status: 200,
          body: File.new(Rails.root.join('spec/assets/avatar.png')),
          headers: { 'Content-Type' => 'image/png' }
        )

        described_class.fetch(bare_url) do |result|
          expect(result.filename).to match(/\Adownload-\d+-[a-f0-9]{8}\z/)
        end
      end

      it 'requires a block' do
        expect { described_class.fetch(url) }.to raise_error(ArgumentError, /block required/)
      end

      it 'forwards custom headers to the upstream request' do
        described_class.fetch(url, headers: { 'x-user' => 'secret-token' }) { nil }

        expect(WebMock).to(have_requested(:get, url)
          .with { |request| request.headers['X-User'] == 'secret-token' })
      end

      it 'supports basic authentication' do
        described_class.fetch(url, http_basic_authentication: %w[user password]) { nil }

        expect(WebMock).to(have_requested(:get, url)
          .with { |request| request.headers['Authorization']&.start_with?('Basic ') })
      end

      it 'supports POST requests with a request body' do
        post_url = 'http://example.com/orders'
        stub_request(:post, post_url)
          .with(body: '{"order_id":"123"}', headers: { 'Content-Type' => 'application/json' })
          .to_return(status: 200, body: '{"created":true}', headers: { 'Content-Type' => 'application/json' })

        described_class.fetch(
          post_url,
          method: :post,
          body: '{"order_id":"123"}',
          headers: { 'Content-Type' => 'application/json' },
          allowed_content_types: ['application/json']
        ) { nil }

        expect(WebMock).to have_requested(:post, post_url)
          .with(body: '{"order_id":"123"}', headers: { 'Content-Type' => 'application/json' })
      end
    end

    context 'with URL validation' do
      it 'raises InvalidUrlError for javascript: URLs' do
        expect { described_class.fetch('javascript:alert(1)') { nil } }
          .to raise_error(SafeFetch::InvalidUrlError)
      end

      it 'raises InvalidUrlError for mailto: URLs' do
        expect { described_class.fetch('mailto:test@example.com') { nil } }
          .to raise_error(SafeFetch::InvalidUrlError)
      end

      it 'raises InvalidUrlError for data: URLs' do
        expect { described_class.fetch('data:text/html,<x>') { nil } }
          .to raise_error(SafeFetch::InvalidUrlError)
      end

      it 'raises InvalidUrlError for ftp: URLs' do
        expect { described_class.fetch('ftp://example.com/file') { nil } }
          .to raise_error(SafeFetch::InvalidUrlError)
      end

      it 'raises InvalidUrlError for malformed URLs' do
        expect { described_class.fetch('not_a_url') { nil } }
          .to raise_error(SafeFetch::InvalidUrlError)
      end

      it 'raises InvalidUrlError when host is missing' do
        expect { described_class.fetch('http:///path') { nil } }
          .to raise_error(SafeFetch::InvalidUrlError, /missing host/)
      end
    end

    context 'with SSRF protection (integration with ssrf_filter)' do
      it 'raises UnsafeUrlError for private IP literals (10.x.x.x)' do
        expect { described_class.fetch('http://10.0.0.1/secret') { nil } }
          .to raise_error(SafeFetch::UnsafeUrlError)
      end

      it 'raises UnsafeUrlError for loopback addresses' do
        expect { described_class.fetch('http://127.0.0.1/secret') { nil } }
          .to raise_error(SafeFetch::UnsafeUrlError)
      end

      it 'raises UnsafeUrlError for AWS metadata IP (169.254.169.254)' do
        expect { described_class.fetch('http://169.254.169.254/latest/meta-data/') { nil } }
          .to raise_error(SafeFetch::UnsafeUrlError)
      end

      it 'raises UnsafeUrlError when hostname resolves to a private IP (DNS rebinding)' do
        allow(Resolv).to receive(:getaddresses).with('evil.example.com').and_return(['10.0.0.1'])
        expect { described_class.fetch('http://evil.example.com/secret') { nil } }
          .to raise_error(SafeFetch::UnsafeUrlError)
      end
    end

    context 'with content-type allowlist' do
      it 'rejects text/html responses' do
        stub_request(:get, url).to_return(
          status: 200,
          body: '<html></html>',
          headers: { 'Content-Type' => 'text/html' }
        )

        expect { described_class.fetch(url) { nil } }
          .to raise_error(SafeFetch::UnsupportedContentTypeError)
      end

      it 'rejects application/octet-stream responses' do
        stub_request(:get, url).to_return(
          status: 200,
          body: 'x',
          headers: { 'Content-Type' => 'application/octet-stream' }
        )

        expect { described_class.fetch(url) { nil } }
          .to raise_error(SafeFetch::UnsupportedContentTypeError)
      end

      it 'allows video/mp4 responses' do
        stub_request(:get, url).to_return(
          status: 200,
          body: File.new(Rails.root.join('spec/assets/avatar.png')),
          headers: { 'Content-Type' => 'video/mp4' }
        )

        expect { described_class.fetch(url) { nil } }.not_to raise_error
      end

      it 'allows audio/mpeg responses' do
        stub_request(:get, url).to_return(
          status: 200,
          body: File.new(Rails.root.join('spec/assets/sample.mp3')),
          headers: { 'Content-Type' => 'audio/mpeg' }
        )

        expect { described_class.fetch(url) { nil } }.not_to raise_error
      end

      it 'allows application/pdf responses' do
        stub_request(:get, url).to_return(
          status: 200,
          body: File.new(Rails.root.join('spec/assets/sample.pdf')),
          headers: { 'Content-Type' => 'application/pdf' }
        )

        expect { described_class.fetch(url) { nil } }.not_to raise_error
      end

      it 'allows text/plain responses' do
        stub_request(:get, url).to_return(
          status: 200,
          body: 'plain-text',
          headers: { 'Content-Type' => 'text/plain' }
        )

        expect { described_class.fetch(url) { nil } }.not_to raise_error
      end

      it 'allows text/csv responses' do
        stub_request(:get, url).to_return(
          status: 200,
          body: "id,name\n1,Chatwoot\n",
          headers: { 'Content-Type' => 'text/csv' }
        )

        expect { described_class.fetch(url) { nil } }.not_to raise_error
      end

      it 'strips charset/boundary parameters before comparing' do
        stub_request(:get, url).to_return(
          status: 200,
          body: 'x',
          headers: { 'Content-Type' => 'image/png; charset=binary' }
        )

        expect { described_class.fetch(url) { nil } }.not_to raise_error
      end

      it 'rejects when the content-type header is missing' do
        stub_request(:get, url).to_return(status: 200, body: 'x', headers: {})

        expect { described_class.fetch(url) { nil } }
          .to raise_error(SafeFetch::UnsupportedContentTypeError)
      end

      it 'allows exact content-type matches when prefixes are empty' do
        pdf_url = 'http://example.com/file.pdf'
        stub_request(:get, pdf_url).to_return(
          status: 200,
          body: 'pdf-data',
          headers: { 'Content-Type' => 'application/pdf' }
        )

        expect do
          described_class.fetch(
            pdf_url,
            allowed_content_type_prefixes: [],
            allowed_content_types: ['application/pdf']
          ) { nil }
        end.not_to raise_error
      end

      it 'skips content-type validation when disabled' do
        stub_request(:get, url).to_return(status: 200, body: 'archive-data', headers: {})

        expect { described_class.fetch(url, validate_content_type: false) { nil } }.not_to raise_error
      end
    end

    context 'with redirects and sensitive headers' do
      it 'strips custom headers on cross-origin redirects' do
        redirect_url = 'http://redirect.example.com/image.png'
        final_url = 'http://cdn.example.com/image.png'

        stub_request(:get, redirect_url)
          .with { |request| request.headers['X-User'] == 'secret-token' }
          .to_return(status: 302, headers: { 'Location' => final_url })

        stub_request(:get, final_url)
          .with { |request| request.headers['X-User'].blank? }
          .to_return(status: 200, body: 'image-data', headers: { 'Content-Type' => 'image/png' })

        expect do
          described_class.fetch(redirect_url, headers: { 'x-user' => 'secret-token' }) { nil }
        end.not_to raise_error

        expect(WebMock).to(have_requested(:get, final_url)
          .with { |request| request.headers['X-User'].blank? })
      end
    end

    context 'with body size cap' do
      it 'honours a custom max_bytes argument' do
        stub_request(:get, url).to_return(
          status: 200,
          body: 'xxxxx',
          headers: { 'Content-Type' => 'image/png' }
        )

        expect { described_class.fetch(url, max_bytes: 2) { nil } }
          .to raise_error(SafeFetch::FileTooLargeError)
      end

      it 'reads the default cap from GlobalConfigService MAXIMUM_FILE_UPLOAD_SIZE (matching Attachment#validate_file_size)' do
        allow(GlobalConfigService).to receive(:load).and_call_original
        allow(GlobalConfigService).to receive(:load).with('MAXIMUM_FILE_UPLOAD_SIZE', 40).and_return('1')

        oversize = 'x' * (1.megabyte + 1)
        stub_request(:get, url).to_return(
          status: 200,
          body: oversize,
          headers: { 'Content-Type' => 'image/png' }
        )

        expect { described_class.fetch(url) { nil } }
          .to raise_error(SafeFetch::FileTooLargeError)
      end

      it 'falls back to 40 MB when GlobalConfigService returns a non-positive value' do
        allow(GlobalConfigService).to receive(:load).and_call_original
        allow(GlobalConfigService).to receive(:load).with('MAXIMUM_FILE_UPLOAD_SIZE', 40).and_return('-10')

        # 1 MB body should pass under the 40 MB fallback
        stub_request(:get, url).to_return(
          status: 200,
          body: 'x' * 1.megabyte,
          headers: { 'Content-Type' => 'image/png' }
        )

        expect { described_class.fetch(url) { nil } }.not_to raise_error
      end

      it 'allows uploads between the old hardcoded 10 MB and the configured limit (regression check)' do
        # Default config is 40 MB; a 15 MB upload must succeed.
        # This is the exact regression scenario: with the old hardcoded 10 MB cap,
        # this would have failed even though direct file uploads of the same size succeed.
        allow(GlobalConfigService).to receive(:load).and_call_original
        allow(GlobalConfigService).to receive(:load).with('MAXIMUM_FILE_UPLOAD_SIZE', 40).and_return('40')

        stub_request(:get, url).to_return(
          status: 200,
          body: 'x' * (15 * 1024 * 1024),
          headers: { 'Content-Type' => 'image/png' }
        )

        expect { described_class.fetch(url) { nil } }.not_to raise_error
      end
    end

    context 'with network failures' do
      it 'maps Net::ReadTimeout to FetchError' do
        stub_request(:get, url).to_raise(Net::ReadTimeout)

        expect { described_class.fetch(url) { nil } }
          .to raise_error(SafeFetch::FetchError)
      end

      it 'maps SocketError to FetchError' do
        stub_request(:get, url).to_raise(SocketError.new('connection refused'))

        expect { described_class.fetch(url) { nil } }
          .to raise_error(SafeFetch::FetchError)
      end
    end

    context 'with non-2xx upstream responses' do
      it 'raises HttpError with the status code in the message' do
        stub_request(:get, url).to_return(status: 404, body: '', headers: {})

        expect { described_class.fetch(url) { nil } }
          .to raise_error(SafeFetch::HttpError, /404/)
      end
    end
  end
end
# rubocop:enable Style/RedundantFetchBlock
