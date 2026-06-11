# frozen_string_literal: true

# ref: https://github.com/rails/rails/issues/43906#issuecomment-1094380699
# https://github.com/rails/rails/issues/43906#issuecomment-1099992310
NODE_HEAP_OPTION = '--max-old-space-size=4096'

task before_assets_precompile: :environment do
  node_options = ENV.fetch('NODE_OPTIONS', '').split
  ENV['NODE_OPTIONS'] = (node_options + [NODE_HEAP_OPTION]).join(' ') unless node_options.any? do |option|
    option.start_with?('--max-old-space-size=')
  end

  # run a command which starts your packaging
  system('pnpm install')
  system('echo "-------------- Bulding SDK for Production --------------"')
  system('pnpm run build:sdk')
  system('echo "-------------- Bulding App for Production --------------"')
end

# every time you execute 'rake assets:precompile'
# run 'before_assets_precompile' first
Rake::Task['assets:precompile'].enhance %w[before_assets_precompile]
