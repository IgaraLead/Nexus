# frozen_string_literal: true

require 'spec_helper'
require_relative '../../lib/public_file_cache_headers'

RSpec.describe PublicFileCacheHeaders do
  let(:app) do
    lambda do |_env|
      [200, { 'Cache-Control' => 'public, max-age=31536000' }, ['ok']]
    end
  end

  it 'requires revalidation for mutable branding assets' do
    _status, headers, _response = described_class.new(app).call({ 'PATH_INFO' => '/brand-assets/logo.svg' })

    expect(headers['Cache-Control']).to eq('public, max-age=0, must-revalidate')
  end

  it 'keeps existing cache headers for other public assets' do
    _status, headers, _response = described_class.new(app).call({ 'PATH_INFO' => '/vite/assets/dashboard.123.js' })

    expect(headers['Cache-Control']).to eq('public, max-age=31536000')
  end
end
