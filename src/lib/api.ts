import type {
  BluetoothPeer,
  Device,
  LocalizedText,
  PublicConfig,
  SetupTestResult,
  Snapshot,
} from '../../shared/types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = (data as { error?: string }).error ?? `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data as T;
}

export const api = {
  snapshot: () => request<Snapshot>('/api/snapshot'),

  patchDevice: (id: string, patch: Record<string, unknown>) =>
    request<{ ok: boolean; changed: string[] }>(`/api/devices/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  createDevice: (payload: Record<string, unknown>) =>
    request<{ ok: boolean; device: Device }>('/api/devices', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateDeviceInfo: (id: string, payload: Record<string, unknown>) =>
    request<{ ok: boolean }>(`/api/devices/${id}/info`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteDevice: (id: string) => request<{ ok: boolean }>(`/api/devices/${id}`, { method: 'DELETE' }),

  command: (id: string, command: string, payload: Record<string, unknown> = {}) =>
    request<{ ok: boolean; message: LocalizedText }>(`/api/devices/${id}/command`, {
      method: 'POST',
      body: JSON.stringify({ command, ...payload }),
    }),

  applyScene: (id: string) =>
    request<{ ok: boolean; changed: number }>(`/api/scenes/${id}/apply`, { method: 'POST' }),

  setAutomation: (id: string, enabled: boolean) =>
    request<{ ok: boolean }>(`/api/automations/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),

  runAutomation: (id: string) =>
    request<{ ok: boolean }>(`/api/automations/${id}/run`, { method: 'POST' }),

  saveConfig: (patch: Partial<PublicConfig> & Record<string, unknown>) =>
    request<PublicConfig>('/api/config', { method: 'PUT', body: JSON.stringify(patch) }),

  testIntegration: (target: 'ir' | 'bluetooth' | 'homeassistant' | 'mqtt', payload: Record<string, unknown>) =>
    request<SetupTestResult>('/api/config/test', { method: 'POST', body: JSON.stringify({ target, ...payload }) }),

  scanBluetooth: () => request<{ peers: BluetoothPeer[] }>('/api/bluetooth/scan', { method: 'POST' }),

  resetDemo: () => request<{ ok: boolean }>('/api/system/reset', { method: 'POST' }),
};
