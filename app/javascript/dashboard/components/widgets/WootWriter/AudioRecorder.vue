<script setup>
import getUuid from 'widget/helpers/uuid';
import { ref, onMounted, onUnmounted, defineEmits, defineExpose } from 'vue';
import WaveSurfer from 'wavesurfer.js';
import RecordPlugin from 'wavesurfer.js/dist/plugins/record.js';
import { format, intervalToDuration } from 'date-fns';
import { convertAudio } from './utils/mp3ConversionUtils';

const props = defineProps({
  audioRecordFormat: {
    type: String,
    required: true,
  },
});

const emit = defineEmits([
  'recorderProgressChanged',
  'finishRecord',
  'pause',
  'play',
]);

const OGG_OPUS_MIME_TYPE = 'audio/ogg; codecs=opus';

const waveformContainer = ref(null);
const wavesurfer = ref(null);
const record = ref(null);
const isRecording = ref(false);
const isPlaying = ref(false);
const hasRecording = ref(false);

const formatTimeProgress = time => {
  const duration = intervalToDuration({ start: 0, end: time });
  return format(
    new Date(0, 0, 0, 0, duration.minutes, duration.seconds),
    'mm:ss'
  );
};

const audioExtension = formatType => {
  if (formatType === OGG_OPUS_MIME_TYPE || formatType === 'audio/ogg') {
    return 'ogg';
  }
  if (formatType === 'audio/wav') {
    return 'wav';
  }
  return 'mp3';
};

const canRecordOggOpus = () => {
  return window.MediaRecorder?.isTypeSupported?.(OGG_OPUS_MIME_TYPE);
};

const outputAudioFormat = () => {
  if (props.audioRecordFormat !== OGG_OPUS_MIME_TYPE) {
    return props.audioRecordFormat;
  }

  return canRecordOggOpus() ? OGG_OPUS_MIME_TYPE : 'audio/mp3';
};

const initWaveSurfer = () => {
  const recordOptions = {
    scrollingWaveform: true,
    renderRecordedAudio: false,
  };

  if (props.audioRecordFormat === OGG_OPUS_MIME_TYPE && canRecordOggOpus()) {
    recordOptions.mimeType = OGG_OPUS_MIME_TYPE;
  }

  wavesurfer.value = WaveSurfer.create({
    container: waveformContainer.value,
    waveColor: '#1F93FF',
    progressColor: '#6E6F73',
    height: 100,
    barWidth: 2,
    barGap: 1,
    barRadius: 2,
    plugins: [RecordPlugin.create(recordOptions)],
  });

  wavesurfer.value.on('pause', () => emit('pause'));
  wavesurfer.value.on('play', () => emit('play'));

  record.value = wavesurfer.value.plugins[0];

  wavesurfer.value.on('finish', () => {
    isPlaying.value = false;
  });

  record.value.on('record-end', async blob => {
    const audioUrl = URL.createObjectURL(blob);
    const formatType = outputAudioFormat();
    const audioBlob = await convertAudio(blob, formatType);
    const fileName = `${getUuid()}.${audioExtension(formatType)}`;
    const file = new File([audioBlob], fileName, {
      type: formatType,
    });
    wavesurfer.value.load(audioUrl);
    emit('finishRecord', {
      name: file.name,
      type: file.type,
      size: file.size,
      file,
    });
    hasRecording.value = true;
    isRecording.value = false;
  });

  record.value.on('record-progress', time => {
    emit('recorderProgressChanged', formatTimeProgress(time));
  });
};

const stopRecording = () => {
  if (isRecording.value) {
    record.value.stopRecording();
    isRecording.value = false;
  }
};

const startRecording = () => {
  record.value.startRecording();
  isRecording.value = true;
};

const playPause = () => {
  if (hasRecording.value) {
    wavesurfer.value.playPause();
    isPlaying.value = !isPlaying.value;
  }
};

onMounted(() => {
  initWaveSurfer();
  startRecording();
});

onUnmounted(() => {
  if (wavesurfer.value) {
    wavesurfer.value.destroy();
  }
});

defineExpose({ playPause, stopRecording, record });
</script>

<template>
  <div ref="waveformContainer" class="w-full p-1" />
</template>
