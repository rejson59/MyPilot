import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import { Room } from './state.js';
import { testTarget } from './adapters.js';
import type { SetupTestResult } from '../shared/types.js';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '127.0.0.1';

const room = new Room();
room.start();

const app = express();
app.use(express.json({ limit: '256kb' }));

const clients = new Set<WebSocket>();

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mode: room.config.mode, wsClients: clients.size, uptimeSec: Math.round((Date.now() - room.startedAt) / 1000) });
});

app.get('/api/snapshot', (_req, res) => {
  res.json(room.snapshot());
});

app.post('/api/devices', (req, res) => {
  try {
    const device = room.createDevice(req.body ?? {});
    res.status(201).json({ ok: true, device });
  } catch (error) {
    res.status(400).json({ ok: false, error: (error as Error).message });
  }
});

app.patch('/api/devices/:id/info', (req, res) => {
  const result = room.updateDeviceInfo(req.params.id, req.body ?? {});
  res.status(result.ok ? 200 : 400).json(result);
});

app.delete('/api/devices/:id', (req, res) => {
  const result = room.deleteDevice(req.params.id);
  res.status(result.ok ? 200 : 400).json(result);
});

app.patch('/api/devices/:id', (req, res) => {
  const { changed } = room.applyPatch(req.params.id, req.body ?? {});
  if (!changed.length) {
    res.status(400).json({ ok: false, error: 'Brak poprawnych pól do zmiany.' });
    return;
  }
  room.addEvent('command', {
    pl: `Zmieniono ${req.params.id}: ${changed.join(', ')}.`,
    en: `Updated ${req.params.id}: ${changed.join(', ')}.`,
  }, req.params.id);
  room.broadcastSnapshot();
  res.json({ ok: true, changed });
});

app.post('/api/devices/:id/command', async (req, res) => {
  const { command, ...payload } = req.body ?? {};
  if (!command) {
    res.status(400).json({ ok: false, error: 'Brak nazwy polecenia.' });
    return;
  }
  try {
    const result = await room.command(req.params.id, String(command), payload);
    res.status(result.ok ? 200 : 409).json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
});

app.post('/api/scenes/:id/apply', (req, res) => {
  const result = room.applyScene(req.params.id);
  res.status(result.ok ? 200 : 404).json(result);
});

app.patch('/api/automations/:id', (req, res) => {
  if (typeof req.body?.enabled !== 'boolean') {
    res.status(400).json({ ok: false, error: 'Oczekiwano pola "enabled".' });
    return;
  }
  res.json(room.toggleAutomation(req.params.id, req.body.enabled));
});

app.post('/api/automations/:id/run', (req, res) => {
  res.json(room.runAutomation(req.params.id, 'manual'));
});

app.get('/api/adapters', (_req, res) => {
  res.json(room.adapters());
});

app.get('/api/config', (_req, res) => {
  res.json(room.snapshot().config);
});

app.put('/api/config', (req, res) => {
  const body = req.body ?? {};
  const patch = { ...body };
  if (typeof body.ownerName === 'string') patch.ownerName = body.ownerName.slice(0, 40);
  if (body.energyPricePerKwh != null) patch.energyPricePerKwh = Number(body.energyPricePerKwh);
  res.json(room.updateConfig(patch));
});

app.post('/api/config/test', async (req, res) => {
  const target = req.body?.target as SetupTestResult['target'];
  if (!['ir', 'bluetooth', 'homeassistant', 'mqtt'].includes(target)) {
    res.status(400).json({ ok: false, error: 'Nieznany cel testu.' });
    return;
  }
  if (target === 'homeassistant' && req.body?.url) room.config.homeAssistant.url = String(req.body.url);
  if (target === 'homeassistant' && req.body?.token) room.config.homeAssistant.token = String(req.body.token);
  if (target === 'ir' && req.body?.url) room.config.irBridge.url = String(req.body.url);
  if (target === 'mqtt' && req.body?.url) room.config.mqtt.url = String(req.body.url);
  const result = await testTarget(target, room.config);
  res.json(result);
});

app.post('/api/bluetooth/scan', (_req, res) => {
  res.json({ peers: room.scanBluetooth() });
});

app.post('/api/system/reset', (_req, res) => {
  room.reset();
  res.json({ ok: true });
});

// --- produkcja: serwujemy zbudowany front ---------------------------------
const distDir = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    if (req.path.includes('.')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (socket) => {
  clients.add(socket);
  room.wsClients = clients.size;
  socket.send(JSON.stringify({ type: 'hello', clientId: Math.random().toString(36).slice(2, 8) }));
  socket.send(JSON.stringify({ type: 'snapshot', snapshot: room.snapshot() }));

  socket.on('message', (raw) => {
    try {
      const message = JSON.parse(String(raw));
      if (message?.type === 'ping') socket.send(JSON.stringify({ type: 'pong' }));
    } catch {
      /* ignorujemy śmieci */
    }
  });

  socket.on('close', () => {
    clients.delete(socket);
    room.wsClients = clients.size;
  });
});

room.subscribe((message) => {
  if (message.type !== 'snapshot') return; // event leci osobno i natychmiast
  const payload = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === 1) client.send(payload);
  }
});

room.subscribe((message) => {
  if (message.type !== 'event') return;
  const payload = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === 1) client.send(payload);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[MyPilot] API + WS na http://${HOST}:${PORT} · tryb: ${room.config.mode}`);
});

const shutdown = () => {
  room.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
