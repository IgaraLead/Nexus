<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import WootSnackbar from './Snackbar.vue';
import { emitter } from 'shared/helpers/mitt';
import { useI18n } from 'vue-i18n';

const props = defineProps({
  duration: {
    type: Number,
    default: 2500,
  },
});

const { t } = useI18n();

const snackMessages = ref([]);

const onNewToastMessage = ({ message: originalMessage, action }) => {
  const message = action?.usei18n ? t(originalMessage) : originalMessage;
  const duration = action?.duration || props.duration;

  snackMessages.value.push({
    key: Date.now(),
    message,
    action,
  });

  setTimeout(() => {
    snackMessages.value.shift();
  }, duration);
};

onMounted(() => {
  emitter.on('newToastMessage', onNewToastMessage);
});

onUnmounted(() => {
  emitter.off('newToastMessage', onNewToastMessage);
});
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed top-4 inset-x-0 z-[9999] flex flex-col items-center px-4 pointer-events-none"
    >
      <transition-group
        name="toast-fade"
        tag="div"
        class="flex flex-col items-center gap-2 pointer-events-auto"
      >
        <WootSnackbar
          v-for="snackMessage in snackMessages"
          :key="snackMessage.key"
          :message="snackMessage.message"
          :action="snackMessage.action"
        />
      </transition-group>
    </div>
  </Teleport>
</template>
