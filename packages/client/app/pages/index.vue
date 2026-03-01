<script setup lang="ts">
import type { BoardPublicInfo, BoardListResponse } from '@athena/types';
import { hostnameToNodeAddress } from '~/composables/useNodeAddress';

const config = useRuntimeConfig();

const selectedBoard = ref<BoardPublicInfo | null>(null);
const showConnection = ref(false);
const showTerminal = ref(false);

const { data: boardData, status, error: fetchError } = await useFetch<BoardListResponse>(
  `${config.public.serverUrl}/api/boards`,
);

const boards = computed(() => boardData.value?.boards ?? []);
const loading = computed(() => status.value === 'pending');
const registryError = computed(() => !!fetchError.value);
const serverStatus = computed<'restarting' | 'online' | 'offline'>(() => {
  if (status.value === 'pending') return 'restarting';
  return fetchError.value ? 'offline' : 'online';
});

function connectToBoard(board: BoardPublicInfo) {
  selectedBoard.value = board;
  showConnection.value = true;
  showTerminal.value = false;
}

function onConnected() {
  showConnection.value = false;
  showTerminal.value = true;
}

function onConnectionFailed() {
  showConnection.value = false;
  selectedBoard.value = null;
}

function onDisconnected() {
  showTerminal.value = false;
  showConnection.value = false;
  selectedBoard.value = null;
}

</script>

<template>
  <div class="min-h-screen bg-gray-950 text-gray-100">
    <!-- Terminal View -->
    <div v-if="showTerminal && selectedBoard">
      <Terminal
        :board="selectedBoard"
        @disconnect="onDisconnected"
      />
    </div>

    <!-- Connection Sequence -->
    <div v-else-if="showConnection && selectedBoard">
      <ConnectionSequence
        :board="selectedBoard"
        @connected="onConnected"
        @failed="onConnectionFailed"
      />
    </div>

    <!-- Board Directory -->
    <div v-else class="max-w-5xl mx-auto px-4 py-8">
      <div class="text-center mb-8">
        <div class="flex items-center justify-center gap-3">
          <h1 class="text-3xl font-bold text-amber-400 font-mono">
            Athena RBBS Network
          </h1>
          <span
            :class="[
              'text-xs px-2 py-0.5 rounded font-mono',
              serverStatus === 'online' ? 'bg-green-900/50 text-green-400'
                : serverStatus === 'restarting' ? 'bg-amber-900/50 text-amber-400'
                : 'bg-red-900/50 text-red-400'
            ]"
          >
            {{ serverStatus }}
          </span>
        </div>
        <p class="text-gray-400 mt-2 font-mono text-sm">
          Board Directory &mdash; Select a board to connect
        </p>
      </div>

      <!-- Registry error notice -->
      <div
        v-if="registryError"
        class="mb-6 p-3 bg-amber-900/30 border border-amber-700 rounded text-amber-300 text-sm font-mono text-center"
      >
        Registry unreachable &mdash; showing cached directory
      </div>

      <!-- Loading -->
      <div v-if="loading" class="text-center py-12">
        <div class="text-gray-500 font-mono">Loading directory...</div>
      </div>

      <!-- Empty state -->
      <div v-else-if="boards.length === 0" class="text-center py-12">
        <div class="text-gray-500 font-mono">No boards available</div>
      </div>

      <!-- Board cards -->
      <div v-else class="grid gap-4 md:grid-cols-2">
        <div
          v-for="board in boards"
          :key="board.id"
          class="bg-gray-900 border border-gray-800 rounded-lg p-5 hover:border-amber-600 transition-colors"
        >
          <div class="flex justify-between items-start mb-2">
            <h2 class="text-lg font-bold text-amber-400 font-mono">
              {{ board.name }}
            </h2>
            <span
              :class="[
                'text-xs px-2 py-0.5 rounded font-mono',
                board.status === 'online'
                  ? 'bg-green-900/50 text-green-400'
                  : 'bg-gray-800 text-gray-500'
              ]"
            >
              {{ board.status }}
            </span>
          </div>

          <p class="text-gray-400 text-sm font-mono mb-3">
            {{ board.tagline }}
          </p>

          <div class="text-xs text-gray-500 font-mono space-y-1 mb-4">
            <div class="flex justify-between">
              <span>SysOp: {{ board.sysop }}</span>
              <span v-if="board.theme" class="text-amber-600">[{{ board.theme }}]</span>
            </div>
            <div class="flex justify-between">
              <span>Users: {{ board.currentUsers }}/{{ board.maxUsers }}</span>
              <span>{{ hostnameToNodeAddress(board.host) }}</span>
            </div>
          </div>

          <button
            class="w-full bg-amber-700 hover:bg-amber-600 text-gray-100 font-mono text-sm py-2 px-4 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="board.status !== 'online'"
            @click="connectToBoard(board)"
          >
            Connect
          </button>
        </div>
      </div>

      <div class="text-center mt-8 text-gray-600 text-xs font-mono">
        Athena RBBS v1.0 &mdash; A modern homage to the Hermes BBS's of the early 1990s
      </div>
    </div>
  </div>
</template>
