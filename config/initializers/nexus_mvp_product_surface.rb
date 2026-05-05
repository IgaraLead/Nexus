# frozen_string_literal: true

# Static product surface for Nexus MVP (OSS, no Hub). Exposed to the dashboard as `window.chatwootConfig.productSurface`.
module NexusMvp
  PRODUCT_SURFACE = {
    captain: false,
    campaigns: false,
    help_center: false,
    voice: false,
    sms_channel: false,
    twilio_whatsapp: false,
    whatsapp_cloud: true,
    whatsapp_baileys: true,
    app_integrations: false,
    audit_logs: false,
    custom_roles: false,
    sla: false,
    conversation_workflow: false,
    billing: false
  }.freeze

  module ProductSurfaceHelper
    module_function

    def frontend_config
      {
        captain: PRODUCT_SURFACE[:captain],
        campaigns: PRODUCT_SURFACE[:campaigns],
        helpCenter: PRODUCT_SURFACE[:help_center],
        voice: PRODUCT_SURFACE[:voice],
        smsChannel: PRODUCT_SURFACE[:sms_channel],
        twilioWhatsapp: PRODUCT_SURFACE[:twilio_whatsapp],
        whatsappCloud: PRODUCT_SURFACE[:whatsapp_cloud],
        whatsappBaileys: PRODUCT_SURFACE[:whatsapp_baileys],
        appIntegrations: PRODUCT_SURFACE[:app_integrations],
        auditLogs: PRODUCT_SURFACE[:audit_logs],
        customRoles: PRODUCT_SURFACE[:custom_roles],
        sla: PRODUCT_SURFACE[:sla],
        conversationWorkflow: PRODUCT_SURFACE[:conversation_workflow],
        billing: PRODUCT_SURFACE[:billing]
      }
    end
  end
end
