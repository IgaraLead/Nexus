#!/usr/bin/env ruby
# frozen_string_literal: true

require 'uri'
require 'shellwords'

# Let DATABASE_URL env take precedence over individual connection params.
if !ENV['DATABASE_URL'].nil? && ENV['DATABASE_URL'] != ''
  uri = URI.parse(ENV.fetch('DATABASE_URL'))
  pass = ENV.fetch('POSTGRES_PASSWORD', '')
  if uri.password.to_s.empty? && !pass.empty?
    uri.password = pass
    uri.user = 'postgres' if uri.user.to_s.empty?
    puts %(export DATABASE_URL=#{Shellwords.escape(uri.to_s)})
  end
  puts "export POSTGRES_HOST=#{uri.host} POSTGRES_PORT=#{uri.port} POSTGRES_USERNAME=#{uri.user}"
elsif ENV['POSTGRES_PORT'].nil? || ENV['POSTGRES_PORT'] == ''
  puts 'export POSTGRES_PORT=5432'
end
