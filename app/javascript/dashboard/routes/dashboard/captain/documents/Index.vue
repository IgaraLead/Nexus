<script setup>
import { computed, onMounted, onUnmounted, ref, nextTick, watch } from 'vue';
import { useTimeoutPoll } from '@vueuse/core';
import { useMapGetter, useStore } from 'dashboard/composables/store';
import { useRoute } from 'vue-router';
import { FEATURE_FLAGS } from 'dashboard/featureFlags';
import { useAccount } from 'dashboard/composables/useAccount';
import { useAlert } from 'dashboard/composables';
import { usePolicy } from 'dashboard/composables/usePolicy';

import DeleteDialog from 'dashboard/components-next/captain/pageComponents/DeleteDialog.vue';
import DocumentCard from 'dashboard/components-next/captain/assistant/DocumentCard.vue';
import DocumentSyncStatsBar from 'dashboard/components-next/captain/assistant/DocumentSyncStatsBar.vue';
import BulkSelectBar from 'dashboard/components-next/captain/assistant/BulkSelectBar.vue';
import BulkDeleteDialog from 'dashboard/components-next/captain/pageComponents/BulkDeleteDialog.vue';
import Policy from 'dashboard/components/policy.vue';
import Button from 'dashboard/components-next/button/Button.vue';
import PageLayout from 'dashboard/components-next/captain/PageLayout.vue';
import CaptainPaywall from 'dashboard/components-next/captain/pageComponents/Paywall.vue';
import RelatedResponses from 'dashboard/components-next/captain/pageComponents/document/RelatedResponses.vue';
import CreateDocumentDialog from 'dashboard/components-next/captain/pageComponents/document/CreateDocumentDialog.vue';
import DocumentPageEmptyState from 'dashboard/components-next/captain/pageComponents/emptyStates/DocumentPageEmptyState.vue';
import FeatureSpotlightPopover from 'dashboard/components-next/feature-spotlight/FeatureSpotlightPopover.vue';
import LimitBanner from 'dashboard/components-next/captain/pageComponents/document/LimitBanner.vue';
import CaptainDocumentAPI from 'dashboard/api/captain/document';
import { useI18n } from 'vue-i18n';

const route = useRoute();
const store = useStore();
const { t } = useI18n();
const { checkPermissions } = usePolicy();

const SYNC_POLL_INTERVAL_MS = 5000;
const SYNC_POLL_MAX_DURATION_MS = 15 * 60 * 1000;
const PERMANENT_SYNC_ERROR_CODES = new Set([
  'not_found',
  'access_denied',
  'content_empty',
]);

const { isOnChatwootCloud, currentAccount } = useAccount();
const uiFlags = useMapGetter('captainDocuments/getUIFlags');
const documents = useMapGetter('captainDocuments/getRecords');
const isFetching = computed(() => uiFlags.value.fetchingList);
const documentsMeta = useMapGetter('captainDocuments/getMeta');

const selectedAssistantId = computed(() => Number(route.params.assistantId));
const canManageDocuments = computed(() => checkPermissions(['administrator']));

const selectedDocument = ref(null);
const deleteDocumentDialog = ref(null);
const bulkDeleteDialog = ref(null);
const bulkSelectedIds = ref(new Set());
const hoveredCard = ref(null);

const handleDelete = () => {
  deleteDocumentDialog.value.dialogRef.open();
};

const showRelatedResponses = ref(false);
const showCreateDialog = ref(false);
const createDocumentDialog = ref(null);
const relationQuestionDialog = ref(null);

const handleShowRelatedDocument = () => {
  showRelatedResponses.value = true;
  nextTick(() => relationQuestionDialog.value.dialogRef.open());
};
const handleCreateDocument = () => {
  showCreateDialog.value = true;
  nextTick(() => createDocumentDialog.value.dialogRef.open());
};

const handleRelatedResponseClose = () => {
  showRelatedResponses.value = false;
};

const handleCreateDialogClose = () => {
  showCreateDialog.value = false;
};

const stats = ref(null);
const activeFilter = ref(null);

const fetchStats = async () => {
  try {
    const { data } = await CaptainDocumentAPI.getStats({
      assistantId: selectedAssistantId.value,
    });
    stats.value = data;
  } catch (error) {
    // non-blocking: keep last known stats
  }
};

const fetchDocuments = async (page = 1) => {
  const filterParams = { page };

  if (selectedAssistantId.value) {
    filterParams.assistantId = selectedAssistantId.value;
  }
  if (activeFilter.value) {
    filterParams.filter = activeFilter.value;
  }
  await fetchStats();
  return store.dispatch('captainDocuments/get', filterParams);
};

const handleFilterSelect = filterKey => {
  activeFilter.value = filterKey;
  bulkSelectedIds.value = new Set();
  fetchDocuments(1);
};

const syncPollStartedAt = ref(null);

const hasDocumentsSyncing = computed(() =>
  (documents.value || []).some(doc => doc.sync_in_progress)
);

const hasSyncingDocuments = computed(
  () => hasDocumentsSyncing.value || Number(stats.value?.syncing) > 0
);

const hasRetryableFailedDocuments = computed(() =>
  (documents.value || []).some(
    doc =>
      doc.sync_status === 'failed' &&
      !PERMANENT_SYNC_ERROR_CODES.has(doc.last_sync_error_code)
  )
);

const isWithinSyncPollWindow = () =>
  syncPollStartedAt.value &&
  Date.now() - syncPollStartedAt.value < SYNC_POLL_MAX_DURATION_MS;

const shouldContinueSyncPolling = () =>
  (hasSyncingDocuments.value || hasRetryableFailedDocuments.value) &&
  isWithinSyncPollWindow();

let syncPollingControls;

function stopSyncPolling() {
  syncPollingControls.pause();
  syncPollStartedAt.value = null;
}

async function pollSyncDocuments() {
  try {
    await fetchDocuments(documentsMeta.value?.page || 1);
  } catch (error) {
    // Keep the existing polling decision based on the last known sync state.
  }

  if (!shouldContinueSyncPolling()) {
    stopSyncPolling();
  }
}

function scheduleSyncPoll() {
  if (syncPollingControls.isActive.value) return;

  syncPollStartedAt.value ||= Date.now();
  syncPollingControls.resume();
}

syncPollingControls = useTimeoutPoll(pollSyncDocuments, SYNC_POLL_INTERVAL_MS, {
  immediate: false,
});

watch(hasSyncingDocuments, isSyncing => {
  if (isSyncing) {
    scheduleSyncPoll();
  }
});

const handleSync = async id => {
  try {
    await store.dispatch('captainDocuments/sync', id);
    useAlert(t('CAPTAIN.DOCUMENTS.SYNC.QUEUED_MESSAGE'));
    await fetchStats();
    scheduleSyncPoll();
  } catch (error) {
    useAlert(t('CAPTAIN.DOCUMENTS.SYNC.ERROR_MESSAGE'));
  }
};

const handleAction = ({ action, id }) => {
  selectedDocument.value = documents.value.find(
    captainDocument => id === captainDocument.id
  );

  nextTick(() => {
    if (action === 'delete') {
      handleDelete();
    } else if (action === 'viewRelatedQuestions') {
      handleShowRelatedDocument();
    } else if (action === 'sync') {
      handleSync(id);
    }
  });
};

const onPageChange = page => {
  const hadSelection = bulkSelectedIds.value.size > 0;
  fetchDocuments(page);

  if (hadSelection) {
    bulkSelectedIds.value = new Set();
  }
};

const onDeleteSuccess = () => {
  if (documents.value?.length === 0 && documentsMeta.value?.page > 1) {
    onPageChange(documentsMeta.value.page - 1);
  } else {
    fetchStats();
  }
};

const buildSelectedCountLabel = computed(() => {
  const count = documents.value?.length || 0;
  const isAllSelected = bulkSelectedIds.value.size === count && count > 0;
  return isAllSelected
    ? t('CAPTAIN.DOCUMENTS.UNSELECT_ALL', { count })
    : t('CAPTAIN.DOCUMENTS.SELECT_ALL', { count });
});

const selectedCountLabel = computed(() => {
  return t('CAPTAIN.DOCUMENTS.SELECTED', {
    count: bulkSelectedIds.value.size,
  });
});

const hasBulkSelection = computed(() => bulkSelectedIds.value.size > 0);

const shouldShowSelectionControl = docId => {
  return (
    canManageDocuments.value &&
    (hoveredCard.value === docId || hasBulkSelection.value)
  );
};

const handleCardHover = (isHovered, id) => {
  hoveredCard.value = isHovered ? id : null;
};

const handleCardSelect = id => {
  if (!canManageDocuments.value) return;
  const selected = new Set(bulkSelectedIds.value);
  selected[selected.has(id) ? 'delete' : 'add'](id);
  bulkSelectedIds.value = selected;
};

const fetchDocumentsAfterBulkAction = () => {
  const hasNoDocumentsLeft = documents.value?.length === 0;
  const currentPage = documentsMeta.value?.page;

  if (hasNoDocumentsLeft) {
    const pageToFetch = currentPage > 1 ? currentPage - 1 : currentPage;
    fetchDocuments(pageToFetch);
  } else {
    fetchDocuments(currentPage);
  }

  bulkSelectedIds.value = new Set();
};

const onBulkDeleteSuccess = () => {
  fetchDocumentsAfterBulkAction();
};

const isSyncableDocument = doc =>
  !doc.pdf_document && doc.status === 'available' && !doc.sync_in_progress;

const syncableSelectedIds = computed(() => {
  if (!bulkSelectedIds.value.size) return [];
  return (documents.value || [])
    .filter(doc => bulkSelectedIds.value.has(doc.id) && isSyncableDocument(doc))
    .map(doc => doc.id);
});

const hasSyncableSelection = computed(
  () => syncableSelectedIds.value.length > 0
);

const handleBulkSync = async () => {
  const ids = syncableSelectedIds.value;
  if (!ids.length) return;

  try {
    const response = await store.dispatch('captainBulkActions/handleBulkSync', {
      ids,
    });
    const queuedCount = response?.count ?? response?.ids?.length ?? 0;
    let message = t('CAPTAIN.DOCUMENTS.BULK_SYNC.ZERO_MESSAGE');

    if (queuedCount === 1) {
      message = t('CAPTAIN.DOCUMENTS.BULK_SYNC.SUCCESS_MESSAGE_ONE');
    } else if (queuedCount > 1) {
      message = t('CAPTAIN.DOCUMENTS.BULK_SYNC.SUCCESS_MESSAGE', {
        count: queuedCount,
      });
    }

    useAlert(message);
    bulkSelectedIds.value = new Set();
    await fetchStats();
    if (queuedCount > 0) {
      scheduleSyncPoll();
    }
  } catch (error) {
    useAlert(t('CAPTAIN.DOCUMENTS.BULK_SYNC.ERROR_MESSAGE'));
  }
};

const syncIntervalHours = computed(() =>
  Number(stats.value?.sync_interval_hours)
);
const isAutoSyncEligible = computed(
  () => Number.isFinite(syncIntervalHours.value) && syncIntervalHours.value > 0
);

const isAutoSyncEnabled = computed(() =>
  Boolean(
    currentAccount.value?.features?.[FEATURE_FLAGS.CAPTAIN_DOCUMENT_AUTO_SYNC]
  )
);

const syncFrequencyLabel = computed(() => {
  if (!isAutoSyncEnabled.value || !isAutoSyncEligible.value) return '';

  if (syncIntervalHours.value === 168) {
    return t('CAPTAIN.DOCUMENTS.STATS.FREQUENCY.WEEKLY');
  }
  if (syncIntervalHours.value === 24) {
    return t('CAPTAIN.DOCUMENTS.STATS.FREQUENCY.DAILY');
  }
  if (syncIntervalHours.value === 1) {
    return t('CAPTAIN.DOCUMENTS.STATS.FREQUENCY.HOURLY');
  }
  if (syncIntervalHours.value % 24 === 0) {
    return t('CAPTAIN.DOCUMENTS.STATS.FREQUENCY.EVERY_N_DAYS', {
      count: syncIntervalHours.value / 24,
    });
  }
  return t('CAPTAIN.DOCUMENTS.STATS.FREQUENCY.EVERY_N_HOURS', {
    count: syncIntervalHours.value,
  });
});

watch(selectedAssistantId, async () => {
  activeFilter.value = null;
  bulkSelectedIds.value = new Set();
  stats.value = null;
  stopSyncPolling();
  await fetchDocuments(1);
  if (hasSyncingDocuments.value) {
    scheduleSyncPoll();
  }
});

onMounted(async () => {
  await fetchDocuments();
  if (hasSyncingDocuments.value) {
    scheduleSyncPoll();
  }
});

onUnmounted(() => {
  stopSyncPolling();
});
</script>

<template>
  <PageLayout
    :header-title="$t('CAPTAIN.DOCUMENTS.HEADER')"
    :button-label="$t('CAPTAIN.DOCUMENTS.ADD_NEW')"
    :button-policy="['administrator']"
    :total-count="documentsMeta.totalCount"
    :current-page="documentsMeta.page"
    :show-pagination-footer="!isFetching && !!documents.length"
    :is-fetching="isFetching"
    :is-empty="!documents.length"
    :show-know-more="false"
    :feature-flag="FEATURE_FLAGS.CAPTAIN"
    @update:current-page="onPageChange"
    @click="handleCreateDocument"
  >
    <template #subHeader>
      <Policy :permissions="['administrator']">
        <BulkSelectBar
          v-model="bulkSelectedIds"
          :all-items="documents"
          :select-all-label="buildSelectedCountLabel"
          :selected-count-label="selectedCountLabel"
          :delete-label="$t('CAPTAIN.DOCUMENTS.BULK_DELETE_BUTTON')"
          class="w-fit"
          :class="{ 'mb-2': bulkSelectedIds.size > 0 }"
          @bulk-delete="bulkDeleteDialog.dialogRef.open()"
        >
          <template v-if="hasSyncableSelection" #secondary-actions>
            <Button
              :label="$t('CAPTAIN.DOCUMENTS.BULK_SYNC_BUTTON')"
              sm
              slate
              ghost
              icon="i-lucide-refresh-cw"
              class="!px-1.5"
              @click="handleBulkSync"
            />
          </template>
        </BulkSelectBar>
      </Policy>
    </template>

    <template #controls>
      <DocumentSyncStatsBar
        :stats="stats"
        :active-filter="activeFilter"
        :sync-frequency-label="syncFrequencyLabel"
        :is-auto-sync-eligible="isAutoSyncEligible"
        :is-auto-sync-enabled="isAutoSyncEnabled"
        class="mb-5"
        @select="handleFilterSelect"
      />
    </template>

    <template #knowMore>
      <FeatureSpotlightPopover
        :button-label="$t('CAPTAIN.HEADER_KNOW_MORE')"
        :title="$t('CAPTAIN.DOCUMENTS.EMPTY_STATE.FEATURE_SPOTLIGHT.TITLE')"
        :note="$t('CAPTAIN.DOCUMENTS.EMPTY_STATE.FEATURE_SPOTLIGHT.NOTE')"
        :hide-actions="!isOnChatwootCloud"
        fallback-thumbnail="/assets/images/dashboard/captain/document-popover-light.svg"
        fallback-thumbnail-dark="/assets/images/dashboard/captain/document-popover-dark.svg"
        learn-more-url="https://chwt.app/captain-document"
      />
    </template>

    <template #emptyState>
      <DocumentPageEmptyState @click="handleCreateDocument" />
    </template>

    <template #paywall>
      <CaptainPaywall />
    </template>

    <template #body>
      <LimitBanner class="mb-5" />

      <div class="flex flex-col gap-4">
        <DocumentCard
          v-for="doc in documents"
          :id="doc.id"
          :key="doc.id"
          :name="doc.name || doc.external_link"
          :external-link="doc.external_link"
          :pdf-document="doc.pdf_document"
          :assistant="doc.assistant"
          :created-at="doc.created_at"
          :status="doc.status"
          :sync-status="doc.sync_status"
          :last-synced-at="doc.last_synced_at"
          :last-sync-error-code="doc.last_sync_error_code"
          :sync-in-progress="doc.sync_in_progress"
          :sync-stale-after-hours="syncIntervalHours"
          :is-selected="canManageDocuments && bulkSelectedIds.has(doc.id)"
          :selectable="canManageDocuments"
          :show-selection-control="shouldShowSelectionControl(doc.id)"
          :show-menu="!bulkSelectedIds.has(doc.id)"
          @action="handleAction"
          @select="handleCardSelect"
          @hover="isHovered => handleCardHover(isHovered, doc.id)"
        />
      </div>
    </template>

    <RelatedResponses
      v-if="showRelatedResponses"
      ref="relationQuestionDialog"
      :captain-document="selectedDocument"
      @close="handleRelatedResponseClose"
    />
    <CreateDocumentDialog
      v-if="showCreateDialog"
      ref="createDocumentDialog"
      :assistant-id="selectedAssistantId"
      @create-success="fetchStats"
      @close="handleCreateDialogClose"
    />
    <DeleteDialog
      v-if="selectedDocument"
      ref="deleteDocumentDialog"
      :entity="selectedDocument"
      type="Documents"
      @delete-success="onDeleteSuccess"
    />
    <BulkDeleteDialog
      v-if="bulkSelectedIds"
      ref="bulkDeleteDialog"
      :bulk-ids="bulkSelectedIds"
      type="AssistantDocument"
      @delete-success="onBulkDeleteSuccess"
    />
  </PageLayout>
</template>
