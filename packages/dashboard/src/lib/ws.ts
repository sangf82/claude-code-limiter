/* ================================================================
   WebSocket client — auto-reconnect with exponential backoff
   ================================================================ */

import type { WSEvent } from './types';

type WSListener = (event: WSEvent) => void;
type ConnectionState = 'connected' | 'connecting' | 'disconnected';

const MAX_RECONNECT_DELAY = 30000;

let socket: WebSocket | null = null;
let listeners: WSListener[] = [];
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;
let intentionalClose = false;
let stateListeners: Array<(state: ConnectionState) => void> = [];

function notifyState(state: ConnectionState): void {
  for (const fn of stateListeners) {
    fn(state);
  }
}

function emit(event: WSEvent): void {
  for (const fn of listeners) {
    try {
      fn(event);
    } catch (err) {
      console.error('[WS] Listener error:', err);
    }
  }
}

function buildUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

function connect(): void {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  intentionalClose = false;
  notifyState('connecting');

  try {
    socket = new WebSocket(buildUrl());
  } catch {
    scheduleReconnect();
    return;
  }

  socket.onopen = () => {
    reconnectDelay = 1000;
    notifyState('connected');
    emit({ type: 'ws_connected', timestamp: new Date().toISOString() });
  };

  socket.onmessage = (evt) => {
    try {
      const data = JSON.parse(evt.data) as WSEvent;
      emit(data);
    } catch {
      // ignore non-JSON messages
    }
  };

  socket.onclose = () => {
    socket = null;
    if (!intentionalClose) {
      notifyState('disconnected');
      emit({ type: 'ws_disconnected', timestamp: new Date().toISOString() });
      scheduleReconnect();
    }
  };

  socket.onerror = () => {
    // onclose will fire after onerror
  };
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  notifyState('connecting');
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
}

function disconnect(): void {
  intentionalClose = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    socket.close();
    socket = null;
  }
  notifyState('disconnected');
}

function onEvent(callback: WSListener): () => void {
  listeners.push(callback);
  return () => {
    const idx = listeners.indexOf(callback);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

function onStateChange(callback: (state: ConnectionState) => void): () => void {
  stateListeners.push(callback);
  return () => {
    const idx = stateListeners.indexOf(callback);
    if (idx !== -1) stateListeners.splice(idx, 1);
  };
}

function isConnected(): boolean {
  return socket !== null && socket.readyState === WebSocket.OPEN;
}

export const ws = {
  connect,
  disconnect,
  onEvent,
  onStateChange,
  isConnected,
};
