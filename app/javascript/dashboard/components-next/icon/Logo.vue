<script setup>
defineOptions({ inheritAttrs: false });
import { useAttrs } from 'vue';
import { useMapGetter } from 'dashboard/composables/store';

const attrs = useAttrs();
const globalConfig = useMapGetter('globalConfig/get');
</script>

<template>
  <span
    v-bind="attrs"
    class="inline-grid shrink-0 place-content-center [&>*]:col-start-1 [&>*]:row-start-1 [&>*]:max-h-full [&>*]:max-w-full"
  >
    <template v-if="globalConfig.logoThumbnail">
      <img :src="globalConfig.logoThumbnail" alt="" class="dark:hidden" />
      <img
        v-if="globalConfig.logoThumbnailDark"
        :src="globalConfig.logoThumbnailDark"
        alt=""
        class="hidden dark:block"
      />
      <!-- IgaraLead mark when dark thumbnail not in DB yet (~90% lightness) -->
      <svg
        v-else
        v-once
        width="16"
        height="16"
        viewBox="0 0 1025 1025"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        class="hidden dark:block text-[#e6e6e6]"
        aria-hidden="true"
      >
        <path
          d="M0 129C0 58.3076 57.3076 1 128 1H256V1025H128C57.3076 1025 0 967.692 0 897V129Z"
          fill="currentColor"
        />
        <path
          d="M385 1C385 0.447715 385.448 0 386 0H641V1024H385V1Z"
          fill="currentColor"
        />
        <path
          d="M769 1.00002C769 0.447738 769.448 0 770 0H897C967.692 0 1025 57.3076 1025 128V896H897C826.308 896 769 838.692 769 768V1.00002Z"
          fill="currentColor"
        />
      </svg>
    </template>
    <svg
      v-else
      v-once
      width="16"
      height="16"
      viewBox="0 0 1025 1025"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      class="text-[#1a1a1a] dark:text-[#e6e6e6]"
      aria-hidden="true"
    >
      <path
        d="M0 129C0 58.3076 57.3076 1 128 1H256V1025H128C57.3076 1025 0 967.692 0 897V129Z"
        fill="currentColor"
      />
      <path
        d="M385 1C385 0.447715 385.448 0 386 0H641V1024H385V1Z"
        fill="currentColor"
      />
      <path
        d="M769 1.00002C769 0.447738 769.448 0 770 0H897C967.692 0 1025 57.3076 1025 128V896H897C826.308 896 769 838.692 769 768V1.00002Z"
        fill="currentColor"
      />
    </svg>
  </span>
</template>
