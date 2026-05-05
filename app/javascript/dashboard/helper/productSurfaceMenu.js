/**
 * @param {Array} items
 * @param {Record<string, boolean>} ps from useProductSurface()
 */
export function filterSidebarMenuItems(items, ps) {
  if (!Array.isArray(items)) return [];

  return items
    .filter(item => {
      if (item.name === 'Captain' && !ps.captain) return false;
      if (item.name === 'Campaigns' && !ps.campaigns) return false;
      if (item.name === 'Portals' && !ps.helpCenter) return false;
      return true;
    })
    .map(item => {
      if (item.name === 'Settings' && Array.isArray(item.children)) {
        const hide = new Set();
        if (!ps.appIntegrations) hide.add('Settings Integrations');
        if (!ps.auditLogs) hide.add('Settings Audit Logs');
        if (!ps.customRoles) hide.add('Settings Custom Roles');
        if (!ps.sla) hide.add('Settings Sla');
        if (!ps.conversationWorkflow) hide.add('Conversation Workflow');
        if (!ps.billing) hide.add('Settings Billing');
        return {
          ...item,
          children: item.children.filter(c => !hide.has(c.name)),
        };
      }
      return item;
    });
}
