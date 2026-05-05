<script setup>
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useAlert } from 'dashboard/composables';
import { useMapGetter, useStore } from 'dashboard/composables/store';
import { useBranding } from 'shared/composables/useBranding';

import PageHeader from '../SettingsSubPageHeader.vue';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const store = useStore();
const { replaceInstallationName } = useBranding();

const globalConfig = useMapGetter('globalConfig/get');
const currentAccount = computed(() => store.getters.getCurrentAccount || {});
const inboxes = useMapGetter('inboxes/getInboxes');
const inboxSlots = computed(() => {
  const maxInboxes =
    currentAccount.value.max_inboxes ||
    currentAccount.value.usage_limits?.inboxes;
  return Number(maxInboxes) > 0 ? Number(maxInboxes) : null;
});
const isInboxLimitReached = computed(() => {
  if (!inboxSlots.value) return false;
  return inboxes.value.length >= inboxSlots.value;
});

onMounted(() => {
  if (!isInboxLimitReached.value) return;
  useAlert(t('INBOX_MGMT.MAX_REACHED'));
  router.replace({ name: 'settings_inbox_list', params: route.params });
});

const createFlowSteps = computed(() => {
  const steps = ['CHANNEL', 'INBOX', 'AGENT', 'FINISH'];

  const routes = {
    CHANNEL: 'settings_inbox_new',
    INBOX: 'settings_inboxes_page_channel',
    AGENT: 'settings_inboxes_add_agents',
    FINISH: 'settings_inbox_finish',
  };

  return steps.map(step => {
    return {
      title: t(`INBOX_MGMT.CREATE_FLOW.${step}.TITLE`),
      body: t(`INBOX_MGMT.CREATE_FLOW.${step}.BODY`),
      route: routes[step],
    };
  });
});

const isFirstStep = computed(() => {
  return route.name === 'settings_inbox_new';
});

const isFinishStep = computed(() => {
  return route.name === 'settings_inbox_finish';
});

const pageTitle = computed(() => {
  if (isFirstStep.value) {
    return t('INBOX_MGMT.ADD.AUTH.TITLE');
  }
  if (isFinishStep.value) {
    return t('INBOX_MGMT.ADD.AUTH.TITLE_FINISH');
  }
  return t('INBOX_MGMT.ADD.AUTH.TITLE_NEXT');
});

const items = computed(() => {
  return createFlowSteps.value.map(item => ({
    ...item,
    body: replaceInstallationName(item.body),
  }));
});
</script>

<template>
  <div class="mx-auto flex flex-col gap-6 mb-8 max-w-7xl w-full !px-6">
    <PageHeader class="block lg:hidden !mb-0" :header-title="pageTitle" />
    <div
      class="grid grid-cols-1 lg:grid-cols-8 lg:divide-x lg:divide-n-weak rounded-xl border border-n-weak h-full min-h-[50dvh]"
    >
      <woot-wizard
        class="hidden lg:block col-span-2 h-fit py-8 px-6"
        :global-config="globalConfig"
        :items="items"
      />
      <div class="col-span-6 flex flex-col overflow-y-auto">
        <router-view />
      </div>
    </div>
  </div>
</template>
