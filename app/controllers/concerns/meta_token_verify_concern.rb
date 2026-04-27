# services from Meta (Prev: Facebook) needs a token verification step for webhook subscriptions,
# This concern handles the token verification step.

module MetaTokenVerifyConcern
  META_SIGNATURE_HEADER = 'X-Hub-Signature-256'.freeze
  META_SIGNATURE_PREFIX = 'sha256='.freeze

  def verify
    service = is_a?(Webhooks::WhatsappController) ? 'whatsapp' : 'instagram'
    if valid_token?(params['hub.verify_token'])
      Rails.logger.info("#{service.capitalize} webhook verified")
      render json: params['hub.challenge']
    else
      render status: :unauthorized, json: { error: 'Error; wrong verify token' }
    end
  end

  private

  def verify_meta_signature!
    return if valid_meta_signature?

    head :unauthorized
  end

  def valid_meta_signature?
    signature = request.headers[META_SIGNATURE_HEADER]
    return false unless signature&.start_with?(META_SIGNATURE_PREFIX)

    meta_app_secrets.any? do |secret|
      next false if secret.blank?

      expected_signature = "#{META_SIGNATURE_PREFIX}#{OpenSSL::HMAC.hexdigest('SHA256', secret, meta_request_body)}"
      ActiveSupport::SecurityUtils.secure_compare(expected_signature, signature)
    end
  end

  def meta_request_body
    @meta_request_body ||= request.raw_post
  end

  def meta_app_secrets
    raise 'Overwrite this method in your controller'
  end

  def valid_token?(_token)
    raise 'Overwrite this method your controller'
  end
end
