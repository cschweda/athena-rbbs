<script setup lang="ts">
import type { BoardPublicInfo, WSMessage } from '@athena/types';
import { useDebugLog } from '~/composables/useDebugLog';

const { debug } = useDebugLog('Terminal');

const props = defineProps<{
  board: BoardPublicInfo;
}>();

const emit = defineEmits<{
  disconnect: [];
}>();

const terminalRef = ref<HTMLPreElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);
const terminalContent = ref('');
const inputValue = ref('');
const inputMask = ref(false);
const inputPrompt = ref('');
const inputMaxLength = ref<number | undefined>(undefined);
const showInput = ref(false);
const timeRemaining = ref('--:--');
const showWarning = ref(false);
const warningMinutes = ref(0);
const cursorVisible = ref(true);

let ws: WebSocket | null = null;
let cursorInterval: ReturnType<typeof setInterval> | null = null;
let timeInterval: ReturnType<typeof setInterval> | null = null;
let sessionStart = 0;
let maxSessionMinutes = 30;
let isSysOp = false;
let reconnectToken: string | null = null;

onMounted(() => {
  // Pick up the WebSocket from ConnectionSequence
  ws = (window as any).__athena_ws;
  const bufferedMessages: MessageEvent[] = (window as any).__athena_ws_buffer || [];
  delete (window as any).__athena_ws;
  delete (window as any).__athena_ws_buffer;

  if (!ws) {
    debug('No WebSocket found, disconnecting');
    emit('disconnect');
    return;
  }

  debug('WS pickup OK, buffered:', bufferedMessages.length);
  setupHandlers();

  // Replay any messages that arrived during the connection animation
  for (const event of bufferedMessages) {
    try {
      const msg: WSMessage = JSON.parse(event.data);
      handleMessage(msg);
    } catch { /* */ }
  }

  // Cursor blink
  cursorInterval = setInterval(() => {
    cursorVisible.value = !cursorVisible.value;
  }, 530);

  // Focus input
  nextTick(() => inputRef.value?.focus());
});

onUnmounted(() => {
  if (cursorInterval) clearInterval(cursorInterval);
  if (timeInterval) clearInterval(timeInterval);
  if (ws) {
    ws.close(1000, 'Client navigated away');
  }
});

function setupHandlers() {
  if (!ws) return;

  ws.onmessage = (event) => {
    try {
      const msg: WSMessage = JSON.parse(event.data);
      handleMessage(msg);
    } catch { /* */ }
  };

  ws.onclose = () => {
    debug('WebSocket closed');
    appendText('\n\n  [Connection closed]\n');
    showInput.value = false;
    setTimeout(() => emit('disconnect'), 2000);
  };

  ws.onerror = () => {
    appendText('\n  [Connection error]\n');
  };
}

function handleMessage(msg: WSMessage) {
  debug('←', msg.type);
  switch (msg.type) {
    case 'server.welcome': {
      const payload = msg.payload as { content: string };
      appendText(payload.content);
      break;
    }
    case 'screen.display': {
      const payload = msg.payload as { content: string; speed?: number };
      if (payload.speed && payload.speed > 0) {
        typeText(payload.content, payload.speed);
      } else {
        appendText(payload.content);
      }
      break;
    }
    case 'command.prompt': {
      const payload = msg.payload as { prompt: string; mask?: boolean; maxLength?: number };
      inputPrompt.value = payload.prompt;
      inputMask.value = payload.mask ?? false;
      inputMaxLength.value = payload.maxLength;
      inputValue.value = '';
      showInput.value = true;
      nextTick(() => inputRef.value?.focus());
      break;
    }
    case 'auth.result': {
      const payload = msg.payload as { success: boolean; handle?: string; token?: string };
      debug('Auth result:', payload.success ? 'SUCCESS' : 'FAILED', payload.handle ?? '');
      if (payload.success) {
        reconnectToken = payload.token ?? null;
        sessionStart = Date.now();
        startTimeDisplay();
      }
      break;
    }
    case 'server.busy': {
      const payload = msg.payload as { message: string };
      appendText(`\n  ${payload.message}\n`);
      break;
    }
    case 'server.goodbye': {
      const payload = msg.payload as { content: string };
      appendText(payload.content);
      break;
    }
    case 'session.warning': {
      const payload = msg.payload as { minutesRemaining: number };
      warningMinutes.value = payload.minutesRemaining;
      showWarning.value = true;
      break;
    }
    case 'session.timeout': {
      appendText('\n  Session time expired.\n');
      break;
    }
    case 'sysop.broadcast': {
      const payload = msg.payload as { message: string; from: string };
      const banner = [
        '',
        '╔══════════════════════════════════════════════╗',
        '║  SYSOP BROADCAST:                            ║',
        `║  ${payload.message.padEnd(43)}║`,
        '╠══════════════════════════════════════════════╣',
        '║  Press Enter to continue.                    ║',
        '╚══════════════════════════════════════════════╝',
        '',
      ].join('\n');
      appendText(banner);
      break;
    }
    case 'error': {
      const payload = msg.payload as { message: string };
      appendText(`\n  Error: ${payload.message}\n`);
      break;
    }
  }

  scrollToBottom();
}

function appendText(text: string) {
  terminalContent.value += text;
  scrollToBottom();
}

async function typeText(text: string, speed: number) {
  for (const char of text) {
    terminalContent.value += char;
    scrollToBottom();
    await new Promise((r) => setTimeout(r, speed));
  }
}

function scrollToBottom() {
  nextTick(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });
}

function handleKeydown(e: KeyboardEvent) {
  // Dismiss warning on Enter
  if (showWarning.value && e.key === 'Enter') {
    showWarning.value = false;
    return;
  }

  if (!showInput.value) return;

  if (e.key === 'Enter') {
    e.preventDefault();
    const text = inputValue.value;
    const displayText = inputMask.value ? '*'.repeat(text.length) : text;

    appendText(`${inputPrompt.value}${displayText}\n`);

    // Send to server
    sendInput(text);

    inputValue.value = '';
    showInput.value = false;
  }
}

function sendInput(text: string) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  debug('→ command.input');
  const msg: WSMessage = {
    type: 'command.input',
    payload: { text },
    timestamp: new Date().toISOString(),
  };
  ws.send(JSON.stringify(msg));
}

function startTimeDisplay() {
  if (isSysOp) {
    timeRemaining.value = 'exempt';
    return;
  }

  timeInterval = setInterval(() => {
    const elapsed = (Date.now() - sessionStart) / 60_000;
    const remaining = Math.max(0, maxSessionMinutes - elapsed);
    const mins = Math.floor(remaining);
    const secs = Math.floor((remaining % 1) * 60);
    timeRemaining.value = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, 1000);
}

function focusInput() {
  inputRef.value?.focus();
}
</script>

<template>
  <div
    class="min-h-screen bg-black"
    @click="focusInput"
  >
    <pre
      ref="terminalRef"
      class="p-4 font-mono text-sm md:text-base text-green-400 whitespace-pre-wrap leading-relaxed"
    >{{ terminalContent }}<span v-if="showInput">{{ inputPrompt }}<span v-if="inputMask">{{ '*'.repeat(inputValue.length) }}</span><span v-else>{{ inputValue }}</span><span :class="{ 'opacity-0': !cursorVisible }" class="text-amber-400">&#9608;</span></span><span v-else><span :class="{ 'opacity-0': !cursorVisible }" class="text-amber-400">&#9608;</span></span></pre>

    <!-- Hidden input -->
    <input
      ref="inputRef"
      v-model="inputValue"
      :type="inputMask ? 'password' : 'text'"
      :maxlength="inputMaxLength"
      class="absolute opacity-0 w-0 h-0"
      autocomplete="off"
      autocorrect="off"
      autocapitalize="off"
      spellcheck="false"
      @keydown="handleKeydown"
    >

    <!-- Session warning overlay -->
    <div
      v-if="showWarning"
      class="fixed inset-0 flex items-center justify-center bg-black/80 z-10"
    >
      <div class="bg-gray-900 border border-amber-600 rounded-lg p-6 max-w-sm text-center font-mono">
        <div class="text-amber-400 text-lg mb-2">Session Warning</div>
        <div class="text-gray-300 mb-4">
          {{ warningMinutes }} minute{{ warningMinutes !== 1 ? 's' : '' }} remaining
        </div>
        <div class="text-gray-500 text-sm">Press Enter to dismiss</div>
      </div>
    </div>
  </div>
</template>
