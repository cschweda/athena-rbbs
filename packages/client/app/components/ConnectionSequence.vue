<script setup lang="ts">
import type { BoardPublicInfo, WSMessage } from '@athena/types';
import { hostnameToNodeAddress } from '~/composables/useNodeAddress';
import { useDebugLog } from '~/composables/useDebugLog';

const { debug } = useDebugLog('Connection');

const props = defineProps<{
  board: BoardPublicInfo;
}>();

const emit = defineEmits<{
  connected: [];
  failed: [reason: string];
}>();

const phase = ref<'dialing' | 'connecting' | 'connected' | 'failed'>('dialing');
const statusLines = ref<string[]>([]);
const progress = ref(0);
const failMessage = ref('');

const nodeAddress = computed(() => hostnameToNodeAddress(props.board.host));

const statusMessages = [
  'CONNECT %NODE%...',
  'CARRIER DETECT',
  'NEGOTIATING PROTOCOL...',
  'ESTABLISHING SESSION...',
  'AUTHENTICATING LINK...',
];

onMounted(async () => {
  try {
    // Phase 1: Connecting (1.5s)
    phase.value = 'dialing';
    statusLines.value = [`CONNECT ${nodeAddress.value}...`];
    await delay(1500);

    // Phase 2: Connecting (2-3s)
    phase.value = 'connecting';
    statusLines.value = [];

    // Show status lines with delays
    for (let i = 0; i < statusMessages.length; i++) {
      const line = statusMessages[i]!.replace('%NODE%', nodeAddress.value);
      statusLines.value.push(line);
      progress.value = ((i + 1) / statusMessages.length) * 80;
      await delay(400 + Math.random() * 200);
    }

    // Actually connect WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${props.board.host}${props.board.websocketPath}`;
    debug('WebSocket URL:', wsUrl);

    const ws = await connectWebSocket(wsUrl);
    debug('WebSocket connected');
    progress.value = 100;

    // Buffer all messages so Terminal can replay them
    const messageBuffer: MessageEvent[] = [];

    const messageHandler = (event: MessageEvent) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        if (msg.type === 'server.busy') {
          const payload = msg.payload as { message: string };
          phase.value = 'failed';
          failMessage.value = `BUSY — ${payload.message}`;
          ws.close();
          setTimeout(() => emit('failed', 'busy'), 2000);
          return;
        }
      } catch { /* */ }
      // Buffer everything else for Terminal to replay
      messageBuffer.push(event);
    };
    ws.addEventListener('message', messageHandler);

    // Phase 3: Connected (0.5s)
    await delay(500);
    statusLines.value.push('CONNECT 14400');
    phase.value = 'connected';

    await delay(800);

    // Remove handler before Terminal takes over
    ws.removeEventListener('message', messageHandler);

    // Store WS and buffered messages for Terminal to pick up
    debug('Buffered messages:', messageBuffer.length);
    (window as any).__athena_ws = ws;
    (window as any).__athena_ws_buffer = messageBuffer;
    emit('connected');
  } catch (err) {
    debug('Connection failed:', err);
    phase.value = 'failed';
    failMessage.value = 'NO CARRIER';
    setTimeout(() => emit('failed', 'error'), 2000);
  }
});

function connectWebSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Connection timeout'));
    }, 10000);

    ws.onopen = () => {
      clearTimeout(timeout);
      resolve(ws);
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Connection failed'));
    };
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
</script>

<template>
  <div class="min-h-screen bg-black flex items-center justify-center">
    <div class="w-full max-w-lg bg-gray-950 border border-gray-700 rounded-lg p-6 font-mono">
      <!-- Header -->
      <div class="text-center mb-4">
        <div class="text-amber-400 text-sm">Athena Terminal</div>
        <div class="text-gray-600 text-xs mt-1">{{ board.name }}</div>
      </div>

      <!-- Connecting phase -->
      <div v-if="phase === 'dialing'" class="text-center">
        <div class="text-green-400 text-sm mb-2">CONNECTING...</div>
        <div class="text-amber-300 text-lg mb-2">{{ board.name }}</div>
        <div class="text-gray-400 text-sm mb-4">{{ nodeAddress }}</div>
        <div class="text-green-500 animate-pulse text-2xl">&#9679;</div>
      </div>

      <!-- Connecting phase -->
      <div v-else-if="phase === 'connecting'" class="space-y-1">
        <div
          v-for="(line, i) in statusLines"
          :key="i"
          class="text-green-400 text-sm"
        >
          {{ line }}
        </div>
        <!-- Progress bar -->
        <div class="mt-4 bg-gray-800 rounded-full h-2 overflow-hidden">
          <div
            class="bg-green-500 h-full transition-all duration-300"
            :style="{ width: `${progress}%` }"
          />
        </div>
      </div>

      <!-- Connected phase -->
      <div v-else-if="phase === 'connected'" class="space-y-1">
        <div
          v-for="(line, i) in statusLines"
          :key="i"
          :class="[
            'text-sm',
            i === statusLines.length - 1 ? 'text-amber-400 font-bold' : 'text-green-400'
          ]"
        >
          {{ line }}
        </div>
        <div class="mt-4 bg-gray-800 rounded-full h-2 overflow-hidden">
          <div class="bg-green-500 h-full w-full" />
        </div>
      </div>

      <!-- Failed phase -->
      <div v-else-if="phase === 'failed'" class="text-center">
        <div class="text-red-400 text-lg mb-2">{{ failMessage }}</div>
        <div class="text-gray-500 text-sm">Returning to directory...</div>
      </div>
    </div>
  </div>
</template>
