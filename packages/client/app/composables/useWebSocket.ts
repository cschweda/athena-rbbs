import type { WSMessage } from '@athena/types';

type MessageHandler = (msg: WSMessage) => void;

export function useWebSocket() {
  const ws = ref<WebSocket | null>(null);
  const connected = ref(false);
  const handlers = new Map<string, MessageHandler[]>();

  function connect(host: string, path: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${host}${path}`;

      const socket = new WebSocket(url);
      ws.value = socket;

      socket.onopen = () => {
        connected.value = true;
        resolve(socket);
      };

      socket.onerror = () => {
        connected.value = false;
        reject(new Error('WebSocket connection failed'));
      };

      socket.onclose = () => {
        connected.value = false;
      };

      socket.onmessage = (event) => {
        try {
          const msg: WSMessage = JSON.parse(event.data);
          const typeHandlers = handlers.get(msg.type);
          if (typeHandlers) {
            for (const handler of typeHandlers) {
              handler(msg);
            }
          }
          // Also fire wildcard handlers
          const wildcardHandlers = handlers.get('*');
          if (wildcardHandlers) {
            for (const handler of wildcardHandlers) {
              handler(msg);
            }
          }
        } catch {
          // Invalid message
        }
      };
    });
  }

  function on(type: string, handler: MessageHandler): void {
    if (!handlers.has(type)) handlers.set(type, []);
    handlers.get(type)!.push(handler);
  }

  function off(type: string, handler: MessageHandler): void {
    const list = handlers.get(type);
    if (!list) return;
    const idx = list.indexOf(handler);
    if (idx >= 0) list.splice(idx, 1);
  }

  function send(type: string, payload: Record<string, unknown> = {}): void {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) return;
    const msg: WSMessage = {
      type,
      payload,
      timestamp: new Date().toISOString(),
    };
    ws.value.send(JSON.stringify(msg));
  }

  function disconnect(): void {
    if (ws.value) {
      ws.value.close(1000, 'Client disconnect');
      ws.value = null;
    }
    connected.value = false;
  }

  function cleanup(): void {
    handlers.clear();
    disconnect();
  }

  return {
    ws: readonly(ws),
    connected: readonly(connected),
    connect,
    on,
    off,
    send,
    disconnect,
    cleanup,
  };
}
