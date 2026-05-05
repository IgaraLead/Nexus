/**
 * Nexus MVP: installation-level UI flags (see config/initializers/nexus_mvp_product_surface.rb).
 */
export function useProductSurface() {
  const surface = window.chatwootConfig?.productSurface || {};
  const on = key => surface[key] === true;

  return {
    surface,
    captain: on('captain'),
    campaigns: on('campaigns'),
    helpCenter: on('helpCenter'),
    voice: on('voice'),
    smsChannel: on('smsChannel'),
    twilioWhatsapp: on('twilioWhatsapp'),
    whatsappCloud: on('whatsappCloud'),
    whatsappBaileys: on('whatsappBaileys'),
    appIntegrations: on('appIntegrations'),
    auditLogs: on('auditLogs'),
    customRoles: on('customRoles'),
    sla: on('sla'),
    conversationWorkflow: on('conversationWorkflow'),
    billing: on('billing'),
  };
}
