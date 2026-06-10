<script setup>
import getUuid from 'widget/helpers/uuid';
import { ref, onMounted, onUnmounted, defineEmits, defineExpose } from 'vue';
import WaveSurfer from 'wavesurfer.js';
import RecordPlugin from 'wavesurfer.js/dist/plugins/record.js';
import OpusRecorder from 'opus-recorder';
import opusEncoderWorkerPath from 'opus-recorder/dist/encoderWorker.min.js?url';
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
const opusRecorder = ref(null);
const progressTimer = ref(null);
const recordingStartedAt = ref(null);
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

const initWaveSurfer = () => {
  const plugins =
    props.audioRecordFormat === OGG_OPUS_MIME_TYPE
      ? []
      : [
          RecordPlugin.create({
            scrollingWaveform: true,
            renderRecordedAudio: false,
          }),
        ];

  wavesurfer.value = WaveSurfer.create({
    container: waveformContainer.value,
    waveColor: '#1F93FF',
    progressColor: '#6E6F73',
    height: 100,
    barWidth: 2,
    barGap: 1,
    barRadius: 2,
    plugins,
  });

  wavesurfer.value.on('pause', () => emit('pause'));
  wavesurfer.value.on('play', () => emit('play'));

  record.value = wavesurfer.value.plugins[0];

  wavesurfer.value.on('finish', () => {
    isPlaying.value = false;
  });

  if (props.audioRecordFormat === OGG_OPUS_MIME_TYPE) return;

  record.value.on('record-end', async blob => {
    const audioUrl = URL.createObjectURL(blob);
    const audioBlob = await convertAudio(blob, props.audioRecordFormat);
    const fileName = `${getUuid()}.${audioExtension(props.audioRecordFormat)}`;
    const file = new File([audioBlob], fileName, {
      type: props.audioRecordFormat,
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

const clearProgressTimer = () => {
  if (!progressTimer.value) return;

  clearInterval(progressTimer.value);
  progressTimer.value = null;
};

const startProgressTimer = () => {
  recordingStartedAt.value = Date.now();
  emit('recorderProgressChanged', formatTimeProgress(0));
  progressTimer.value = setInterval(() => {
    emit(
      'recorderProgressChanged',
      formatTimeProgress(Date.now() - recordingStartedAt.value)
    );
  }, 500);
};

const emitOpusRecording = arrayBuffer => {
  clearProgressTimer();
  const audioBlob = new Blob([arrayBuffer], { type: OGG_OPUS_MIME_TYPE });
  const fileName = `${getUuid()}.ogg`;
  const file = new File([audioBlob], fileName, { type: OGG_OPUS_MIME_TYPE });
  const audioUrl = URL.createObjectURL(audioBlob);

  wavesurfer.value.load(audioUrl);
  emit('finishRecord', {
    name: file.name,
    type: file.type,
    size: file.size,
    file,
  });
  hasRecording.value = true;
  isRecording.value = false;
};

const startOpusRecording = async () => {
  opusRecorder.value = new OpusRecorder({
    encoderPath: opusEncoderWorkerPath,
    encoderApplication: 2048,
    numberOfChannels: 1,
  });
  opusRecorder.value.ondataavailable = emitOpusRecording;
  opusRecorder.value.onstop = clearProgressTimer;
  await opusRecorder.value.start();
  startProgressTimer();
  isRecording.value = true;
};

const stopRecording = () => {
  if (isRecording.value) {
    if (props.audioRecordFormat === OGG_OPUS_MIME_TYPE) {
      opusRecorder.value?.stop();
      isRecording.value = false;
      return;
    }

    record.value.stopRecording();
    isRecording.value = false;
  }
};

const startRecording = async () => {
  if (props.audioRecordFormat === OGG_OPUS_MIME_TYPE) {
    await startOpusRecording();
    return;
  }

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
  clearProgressTimer();
  if (opusRecorder.value) {
    opusRecorder.value.close();
  }
  if (wavesurfer.value) {
    wavesurfer.value.destroy();
  }
});

defineExpose({ playPause, stopRecording, record });
</script>

<template>
  <div ref="waveformContainer" class="w-full p-1" />
</template>
