# frozen_string_literal: true

class PublicFileCacheHeaders
  CACHE_CONTROL = 'public, max-age=0, must-revalidate'
  MUTABLE_PUBLIC_PATHS = %r{\A/(brand-assets/|manifest\.json\z|sw\.js\z|favicon|apple-icon-|android-icon-|ms-icon-)}

  def initialize(app)
    @app = app
  end

  def call(env)
    status, headers, response = @app.call(env)
    headers['Cache-Control'] = CACHE_CONTROL if mutable_public_path?(env['PATH_INFO'])

    [status, headers, response]
  end

  private

  def mutable_public_path?(path)
    path.to_s.match?(MUTABLE_PUBLIC_PATHS)
  end
end
