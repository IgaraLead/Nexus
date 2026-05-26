export const vueRemovalGates = [
  'All route parity statuses are production-ready.',
  'React route feature flags are enabled for internal and external users.',
  'Error and performance telemetry are stable for one release window.',
  'Rollback to Vue has not been used during the stabilization window.',
  'Rails routes no longer depend on Vue-only bootstrap payloads.',
];

export const canRemoveVue = (completedGates: string[]) =>
  vueRemovalGates.every(gate => completedGates.includes(gate));
