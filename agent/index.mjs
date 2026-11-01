#!/usr/bin/env node
/**
 * MyPilot Agent — mały serwer HTTP na Twoim komputerze.
 * Pozwala MyPilotowi realnie: czytać stan PC, ustawiać głośność,
 * sterować multimediami, uruchamiać aplikacje i usypiać komputer.
 *
 * Uruchomienie:  node agent/index.mjs
 * Wymagania:     Node 18+ (zero zależności)
 * Bezpieczeństwo: token w nagłówku X-MyPilot-Token. Domyślnie nasłuchuje
 * tylko na 127.0.0.1 — w sieci lokalnej ustaw MYPILOT_AGENT_HOST=0.0.0.0.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  getState,
  isDryRun,
  launchApp,
  media,
  platformInfo,
  power,
  setVolume,
  toggleMute,
  detectAudioTools,
} from './platform.mjs';

const VERSION = '1.0.0';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.MYPILOT_AGENT_PORT ?? 8790);
const HOST = process.env.MYPILOT_AGENT_HOST ?? '127.0.0.1';

function loadToken() {
  if (process.env.MYPILOT_AGENT_TOKEN) return process.env.MYPILOT_AGENT_TOKEN.trim();
  const tokenFile = path.join(__dirname, '.agent-token');
  try {
    const saved = fs.readFileSync(tokenFile, 'utf8').trim();
    if (saved.length >= 16) return saved;
  } catch {
    /* pierwszy start */
  }
  const token = crypto.randomBytes(18).toString('hex');
  try {
    fs.writeFileSync(tokenFile, token, { mode: 0o600 });
  } catch {
    console.warn('[MyPilot Agent] Nie udało się zapisać tokenu — użyj MYPILOT_AGENT_TOKEN.');
  }
  return token;
}

const TOKEN = loadToken();
const startedAt = Date.now();

const json = (res, code, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
};

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('Za duże żądanie.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('Niepoprawny JSON.'));
      }
    });
    req.on('error', reject);
  });
}

const authorized = (req) => {
  const header = req.headers['x-mypilot-token'];
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const query = url.searchParams.get('token');
  const provided = String(header ?? query ?? '');
  if (provided.length !== TOKEN.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(TOKEN));
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const route = `${req.method} ${url.pathname}`;

  try {
    if (route === 'GET /health') {
      const tools = await detectAudioTools();
      json(res, 200, {
        ok: true,
        name: 'MyPilot Agent',
        version: VERSION,
        hostname: (await import('node:os')).hostname(),
        platform: platformInfo(),
        audio: tools,
        dryRun: isDryRun(),
        uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      });
      return;
    }

    if (url.pathname !== '/health' && !authorized(req)) {
      json(res, 401, { ok: false, error: 'Nieprawidłowy token agenta.' });
      return;
    }

    if (route === 'GET /state') {
      json(res, 200, { ok: true, version: VERSION, state: await getState() });
      return;
    }

    if (req.method === 'POST') {
      const body = await readBody(req);

      if (route === 'POST /volume') {
        const level = Number(body.level);
        if (!Number.isFinite(level)) return json(res, 400, { ok: false, error: 'Brak pola "level".' });
        return json(res, 200, { ok: true, result: await setVolume(level) });
      }

      if (route === 'POST /mute') {
        const force = typeof body.muted === 'boolean' ? body.muted : undefined;
        return json(res, 200, { ok: true, result: await toggleMute(force) });
      }

      if (route === 'POST /media') {
        const action = String(body.action ?? 'play-pause');
        if (!['play-pause', 'next', 'prev'].includes(action)) {
          return json(res, 400, { ok: false, error: 'Nieznana akcja mediów.' });
        }
        return json(res, 200, { ok: true, result: await media(action) });
      }

      if (route === 'POST /power') {
        const action = String(body.action ?? '');
        if (!['sleep', 'lock', 'display-off'].includes(action)) {
          return json(res, 400, { ok: false, error: 'Dozwolone akcje: sleep, lock, display-off.' });
        }
        return json(res, 200, { ok: true, result: await power(action) });
      }

      if (route === 'POST /apps/launch') {
        const name = String(body.name ?? '');
        return json(res, 200, { ok: true, result: await launchApp(name) });
      }

      return json(res, 404, { ok: false, error: `Nieznana ścieżka: ${route}` });
    }

    json(res, 404, { ok: false, error: `Nieznana ścieżka: ${route}` });
  } catch (error) {
    json(res, 500, { ok: false, error: error?.message ?? 'Błąd agenta.' });
  }
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  MyPilot Agent ' + VERSION);
  console.log('  ─────────────────────────────────────────────');
  console.log(`  Adres:  http://${HOST}:${PORT}`);
  console.log(`  Token:  ${TOKEN}`);
  console.log(`  System: ${platformInfo().platform}/${platformInfo().arch}${isDryRun() ? '  (dry-run)' : ''}`);
  console.log('');
  console.log('  Wklej adres i token w MyPilot → Ustawienia → Agent MyPilot.');
  console.log('  Zatrzymanie: Ctrl+C');
  console.log('');
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
