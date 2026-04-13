<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';

import CardLayout from 'dashboard/components-next/CardLayout.vue';
import Button from 'dashboard/components-next/button/Button.vue';
import InlineInput from 'dashboard/components-next/inline-input/InlineInput.vue';
import { useCompaniesStore } from 'dashboard/stores/companies';

const props = defineProps({
  company: {
    type: Object,
    default: () => ({}),
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
});

const { t } = useI18n();
const companiesStore = useCompaniesStore();

const editableName = ref('');
const editableDomain = ref('');
const editableCrmUrl = ref('');
const editableDescription = ref('');
const isEditingDescription = ref(false);
const savingField = ref('');

const uiFlags = computed(() => companiesStore.getUIFlags);
const isUpdating = computed(() => uiFlags.value.updatingItem);
const canRenderForm = computed(() => Boolean(props.company?.id));

const formatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const formatDate = value => {
  if (!value) {
    return t('COMPANIES.DETAIL.PROFILE.NOT_PROVIDED');
  }

  return formatter.format(new Date(value));
};

const syncEditableFields = company => {
  editableName.value = company?.name || '';
  editableDomain.value = company?.domain || '';
  editableCrmUrl.value = company?.crmUrl || '';
  editableDescription.value = company?.description || '';
};

watch(
  () => [
    props.company?.id,
    props.company?.name,
    props.company?.domain,
    props.company?.crmUrl,
    props.company?.description,
  ],
  () => {
    syncEditableFields(props.company);
  },
  { immediate: true }
);

const readonlyProfileItems = computed(() => [
  {
    label: t('COMPANIES.DETAIL.PROFILE.FIELDS.CONTACTS_COUNT'),
    value: t('COMPANIES.CONTACTS_COUNT', {
      n: Number(props.company?.contactsCount || 0),
    }),
  },
  {
    label: t('COMPANIES.DETAIL.PROFILE.FIELDS.CREATED_AT'),
    value: formatDate(props.company?.createdAt),
  },
  {
    label: t('COMPANIES.DETAIL.PROFILE.FIELDS.UPDATED_AT'),
    value: formatDate(props.company?.updatedAt),
  },
]);

const saveField = async (field, rawValue) => {
  if (!props.company?.id || savingField.value === field) {
    return false;
  }

  const nextValue = rawValue.trim();
  const currentValue = `${props.company?.[field] || ''}`.trim();

  if (nextValue === currentValue) {
    syncEditableFields(props.company);
    return true;
  }

  savingField.value = field;

  try {
    const updatedCompany = await companiesStore.update({
      id: props.company.id,
      [field]: nextValue,
    });
    syncEditableFields(updatedCompany);
    useAlert(t('COMPANIES.DETAIL.PROFILE.MESSAGES.UPDATE_SUCCESS'));
    return true;
  } catch {
    syncEditableFields(props.company);
    useAlert(t('COMPANIES.DETAIL.PROFILE.MESSAGES.UPDATE_ERROR'));
    return false;
  } finally {
    savingField.value = '';
  }
};

const startDescriptionEdit = () => {
  if (isUpdating.value) {
    return;
  }

  editableDescription.value = props.company?.description || '';
  isEditingDescription.value = true;
};

const cancelDescriptionEdit = () => {
  editableDescription.value = props.company?.description || '';
  isEditingDescription.value = false;
};

const saveDescription = async () => {
  const didSave = await saveField('description', editableDescription.value);

  if (didSave) {
    isEditingDescription.value = false;
  }
};
</script>

<template>
  <CardLayout>
    <div class="flex flex-col gap-6">
      <div class="flex flex-col gap-1">
        <h2 class="text-lg font-medium text-n-slate-12">
          {{ t('COMPANIES.DETAIL.PROFILE.TITLE') }}
        </h2>
        <p class="text-sm text-n-slate-11">
          {{ t('COMPANIES.DETAIL.PROFILE.SUBTITLE') }}
        </p>
      </div>

      <div v-if="isLoading && !company?.id" class="text-sm text-n-slate-11">
        {{ t('COMPANIES.DETAIL.LOADING') }}
      </div>

      <div v-else-if="canRenderForm" class="flex flex-col gap-6">
        <div class="flex flex-col gap-1">
          <span
            class="text-xs font-medium tracking-wide uppercase text-n-slate-10"
          >
            {{ t('COMPANIES.DETAIL.PROFILE.FIELDS.NAME') }}
          </span>
          <InlineInput
            v-model="editableName"
            :disabled="isUpdating"
            :placeholder="t('COMPANIES.UNNAMED')"
            custom-input-class="min-h-8 px-0 py-1 text-sm leading-6 border-b border-n-weak focus:border-n-brand"
            @blur="saveField('name', $event)"
            @enter-press="saveField('name', editableName)"
          />
        </div>

        <div class="flex flex-col gap-1">
          <span
            class="text-xs font-medium tracking-wide uppercase text-n-slate-10"
          >
            {{ t('COMPANIES.DETAIL.PROFILE.FIELDS.DOMAIN') }}
          </span>
          <InlineInput
            v-model="editableDomain"
            :disabled="isUpdating"
            :placeholder="t('COMPANIES.DETAIL.PROFILE.NOT_PROVIDED')"
            custom-input-class="min-h-8 px-0 py-1 text-sm leading-6 border-b border-n-weak focus:border-n-brand"
            @blur="saveField('domain', $event)"
            @enter-press="saveField('domain', editableDomain)"
          />
        </div>

        <div class="flex flex-col gap-1">
          <span
            class="text-xs font-medium tracking-wide uppercase text-n-slate-10"
          >
            {{ t('COMPANIES.DETAIL.PROFILE.FIELDS.CRM') }}
          </span>
          <InlineInput
            v-model="editableCrmUrl"
            :disabled="isUpdating"
            :placeholder="t('COMPANIES.DETAIL.PROFILE.NOT_PROVIDED')"
            custom-input-class="min-h-8 px-0 py-1 text-sm leading-6 border-b border-n-weak focus:border-n-brand"
            @blur="saveField('crmUrl', $event)"
            @enter-press="saveField('crmUrl', editableCrmUrl)"
          />
        </div>

        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between gap-3">
            <span
              class="text-xs font-medium tracking-wide uppercase text-n-slate-10"
            >
              {{ t('COMPANIES.DETAIL.PROFILE.FIELDS.DESCRIPTION') }}
            </span>
            <Button
              v-if="!isEditingDescription"
              :label="t('COMPANIES.DETAIL.PROFILE.ACTIONS.EDIT_DESCRIPTION')"
              variant="link"
              color="slate"
              size="sm"
              :disabled="isUpdating"
              @click="startDescriptionEdit"
            />
          </div>

          <template v-if="isEditingDescription">
            <textarea
              v-model="editableDescription"
              rows="5"
              class="w-full px-3 py-2 text-sm leading-6 border rounded-xl border-n-weak bg-n-surface-1 text-n-slate-12 placeholder:text-n-slate-10 focus:outline-none focus:ring-1 focus:ring-n-brand focus:border-n-brand"
              :placeholder="
                t('COMPANIES.DETAIL.PROFILE.DESCRIPTION_PLACEHOLDER')
              "
            />
            <div class="flex items-center justify-end gap-3">
              <Button
                :label="t('COMPANIES.DETAIL.PROFILE.ACTIONS.CANCEL')"
                color="slate"
                variant="faded"
                size="sm"
                @click="cancelDescriptionEdit"
              />
              <Button
                :label="t('COMPANIES.DETAIL.PROFILE.ACTIONS.SAVE')"
                color="blue"
                size="sm"
                :is-loading="savingField === 'description'"
                :disabled="isUpdating"
                @click="saveDescription"
              />
            </div>
          </template>

          <p v-else class="text-sm leading-6 break-words text-n-slate-12">
            {{
              company?.description || t('COMPANIES.DETAIL.PROFILE.NOT_PROVIDED')
            }}
          </p>
        </div>

        <dl class="grid gap-4 sm:grid-cols-2">
          <div
            v-for="item in readonlyProfileItems"
            :key="item.label"
            class="flex flex-col gap-1"
          >
            <dt
              class="text-xs font-medium tracking-wide uppercase text-n-slate-10"
            >
              {{ item.label }}
            </dt>
            <dd class="text-sm leading-6 break-words text-n-slate-12">
              {{ item.value }}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  </CardLayout>
</template>
