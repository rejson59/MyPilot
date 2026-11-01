import type { ServerMessage } from '../../shared/types';
import { api } from './api';
import { useApp } from './store';

/**
 * Utrzymuje połączenie w czasie rzeczywistym. WebSocket daje 60 fps stanu,
 * a gdy sieć go zerwie — włączamy polling, żeby aplikacja nigdy nie zamarzła.
 */
export function connectLive(): () => void {
  let socket: WebSocket | null = null;
  let attempts = 0;
  let reconnectTimer: number | undefined;
  let pollTimer: number | undefined;
  let disposed = false;

  const { setSnapshot, setConnected, setReady, toast } = useApp.getState();

  const stopPolling = () => {
    if (pollTimer) window.clearInterval(pollTimer);
    pollTimer = undefined;
  };

  const startPolling = () => {
    if (pollTimer) return;
    pollTimer = window.setInterval(async () => {
      try {
        const snapshot = await api.snapshot();
        setSnapshot(snapshot);
        setConnected(true);
      } catch {
        setConnected(false);
      }
    }, 3000);
  };

  const connect = () => {
    if (disposed) return;
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${window.location.host}/ws`;

    try {
      socket = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }

    socket.onopen = () => {
      attempts = 0;
      setConnected(true);
      stopPolling();
    };

    socket.onmessage = (event) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(event.data as string) as ServerMessage;
      } catch {
        return;
      }
      if (message.type === 'snapshot') {
        setSnapshot(message.snapshot);
        setReady(true);
        setConnected(true);
      }
      if (message.type === 'event') {
        const name = message.event.message;
        const locale = useApp.getState().locale;
        if (message.event.kind === 'warning') toast(name[locale], 'error');
      }
    };

    socket.onclose = () => {
      setConnected(false);
      if (disposed) return;
      startPolling();
      scheduleReconnect();
    };

    socket.onerror = () => {
      socket?.close();
    };
  };

  const scheduleReconnect = () => {
    if (disposed) return;
    attempts += 1;
    const delay = Math.min(1500 * attempts, 8000);
    window.clearTimeout(reconnectTimer);
    reconnectTimer = window.setTimeout(connect, delay);
  };

  const onVisible = () => {
    if (document.visibilityState === 'visible' && socket?.readyState !== WebSocket.OPEN) connect();
  };

  connect();
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    disposed = true;
    window.clearTimeout(reconnectTimer);
    stopPolling();
    document.removeEventListener('visibilitychange', onVisible);
    socket?.close();
  };
}
