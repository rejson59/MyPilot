/**
 * Warstwa systemowa agenta MyPilot.
 * Każda funkcja stara się użyć natywnego narzędzia systemu i zwraca null,
 * gdy narzędzia nie ma — zamiast wysypywać cały agent.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';

const run = promisify(execFile);
const platform = process.platform;
const dryRun = process.env.MYPILOT_AGENT_DRY_RUN === '1';

/**
 * Na Windows wybieramy PowerShell 7 (pwsh), jeśli jest, inaczej wbudowany
 * powershell.exe. Dzięki temu agent działa też na czystym systemie.
 */
const PS = await (async () => {
  if (platform !== 'win32') return 'powershell';
  try {
    const { stdout } = await run('where', ['pwsh'], { timeout: 2500 });
    return stdout.trim() ? 'pwsh' : 'powershell';
  } catch {
    return 'powershell';
  }
})();

export const isDryRun = () => dryRun;

async function sh(command, args, timeout = 4000) {
  try {
    const { stdout } = await run(command, args, { timeout });
    return stdout.trim();
  } catch {
    return null;
  }
}

async function has(command) {
  const out = await sh(platform === 'win32' ? 'where' : 'which', [command], 2500);
  return Boolean(out);
}

/* ------------------------------------------------------------------ audio */

let audioTools = null;

export async function detectAudioTools() {
  if (audioTools) return audioTools;
  if (platform === 'darwin') {
    audioTools = { exact: true, canSet: true, backend: 'osascript' };
  } else if (platform === 'win32') {
    const module = await sh(PS, [
      '-NoProfile',
      '-Command',
      'if (Get-Module -ListAvailable AudioDeviceCmdlets) { "yes" }',
    ]);
    const nircmd = await has('nircmd');
    audioTools = {
      exact: Boolean(module),
      canSet: Boolean(module || nircmd),
      backend: module ? 'AudioDeviceCmdlets' : nircmd ? 'nircmd' : 'keys',
    };
  } else {
    const pactl = await has('pactl');
    const amixer = await has('amixer');
    audioTools = {
      exact: Boolean(pactl || amixer),
      canSet: Boolean(pactl || amixer),
      backend: pactl ? 'pactl' : amixer ? 'amixer' : 'none',
    };
  }
  return audioTools;
}

export async function getVolume() {
  if (dryRun) return null;
  if (platform === 'darwin') {
    const out = await sh('osascript', ['-e', 'output volume of (get volume settings)']);
    return out && /^\d+$/.test(out) ? Number(out) : null;
  }

  if (platform === 'win32') {
    if (audioTools?.backend === 'AudioDeviceCmdlets') {
      const out = await sh(PS, ['-NoProfile', '-Command', '(Get-AudioDevice -PlaybackVolume).Volume']);
      const value = out && Number.parseFloat(out.replace(',', '.'));
      return Number.isFinite(value) ? Math.round(value) : null;
    }
    return null; // bez modułu nie odczytamy dokładnej wartości
  }

  if (audioTools?.backend === 'pactl') {
    const out = await sh('pactl', ['get-sink-volume', '@DEFAULT_SINK@']);
    const match = out?.match(/(\d+)%/);
    return match ? Number(match[1]) : null;
  }
  if (audioTools?.backend === 'amixer') {
    const out = await sh('amixer', ['-M', 'get', 'Master']);
    const match = out?.match(/\[(\d+)%\]/);
    return match ? Number(match[1]) : null;
  }
  return null;
}

export async function setVolume(level) {
  const value = Math.max(0, Math.min(100, Math.round(level)));
  if (dryRun) return { ok: true, note: 'dry-run' };

  if (platform === 'darwin') {
    const out = await sh('osascript', ['-e', `set volume output volume ${value}`]);
    return out === null ? { ok: false, error: 'osascript nie odpowiedział' } : { ok: true };
  }

  if (platform === 'win32') {
    if (audioTools?.backend === 'AudioDeviceCmdlets') {
      const out = await sh(PS, ['-NoProfile', '-Command', `Set-AudioDevice -PlaybackVolume ${value}`]);
      return out === null ? { ok: false, error: 'Set-AudioDevice nie powiodło się' } : { ok: true };
    }
    if (audioTools?.backend === 'nircmd') {
      const raw = Math.round((value / 100) * 65535);
      const out = await sh('nircmd', ['setsysvolume', String(raw)]);
      return out === null ? { ok: false, error: 'nircmd nie odpowiedział' } : { ok: true };
    }
    return {
      ok: false,
      error:
        'Windows: zainstaluj moduł AudioDeviceCmdlets (Install-Module AudioDeviceCmdlets) lub nircmd, aby ustawiać głośność.',
    };
  }

  if (audioTools?.backend === 'pactl') {
    const out = await sh('pactl', ['set-sink-volume', '@DEFAULT_SINK@', `${value}%`]);
    return out === null ? { ok: false, error: 'pactl nie odpowiedział (brak PulseAudio/PipeWire?)' } : { ok: true };
  }
  if (audioTools?.backend === 'amixer') {
    const out = await sh('amixer', ['-M', 'set', 'Master', `${value}%`]);
    return out === null ? { ok: false, error: 'amixer nie odpowiedział' } : { ok: true };
  }
  return { ok: false, error: 'Brak narzędzia audio (pactl/amixer). Zainstaluj pulseaudio-utils.' };
}

export async function toggleMute(force) {
  if (dryRun) return { ok: true, note: 'dry-run' };
  if (platform === 'darwin') {
    const wanted = typeof force === 'boolean' ? force : null;
    const script =
      wanted === null
        ? 'set volume output muted not (output muted of (get volume settings))'
        : `set volume output muted ${wanted ? 'true' : 'false'}`;
    return (await sh('osascript', ['-e', script])) === null
      ? { ok: false, error: 'osascript nie odpowiedział' }
      : { ok: true };
  }
  if (platform === 'win32') {
    if (audioTools?.backend === 'AudioDeviceCmdlets') {
      const cmd =
        typeof force === 'boolean'
          ? force
            ? 'Set-AudioDevice -PlaybackMute $true'
            : 'Set-AudioDevice -PlaybackMute $false'
          : 'Set-AudioDevice -PlaybackMuteToggle';
      return (await sh(PS, ['-NoProfile', '-Command', cmd])) === null
        ? { ok: false, error: 'Set-AudioDevice nie powiodło się' }
        : { ok: true };
    }
    const script = '(New-Object -ComObject WScript.Shell).SendKeys([char]173)';
    return (await sh(PS, ['-NoProfile', '-Command', script])) === null
      ? { ok: false, error: 'Brak możliwości wyciszenia (zainstaluj AudioDeviceCmdlets)' }
      : { ok: true };
  }
  if (audioTools?.backend === 'pactl') {
    const arg = typeof force === 'boolean' ? String(force ? 1 : 0) : 'toggle';
    return (await sh('pactl', ['set-sink-mute', '@DEFAULT_SINK@', arg])) === null
      ? { ok: false, error: 'pactl nie odpowiedział' }
      : { ok: true };
  }
  return { ok: false, error: 'Brak narzędzia audio.' };
}

/* ------------------------------------------------------------------ media */

export async function media(action) {
  if (dryRun) return { ok: true, note: 'dry-run' };

  if (platform === 'linux') {
    const map = { 'play-pause': 'play-pause', next: 'next', prev: 'previous' };
    const out = await sh('playerctl', [map[action] ?? 'play-pause']);
    return out === null
      ? { ok: false, error: 'Brak playerctl (sudo apt install playerctl).' }
      : { ok: true };
  }

  if (platform === 'darwin') {
    const script =
      action === 'next'
        ? 'tell application "System Events" to key code 124 using {command down}'
        : action === 'prev'
          ? 'tell application "System Events" to key code 123 using {command down}'
          : 'tell application "System Events" to key code 49';
    return (await sh('osascript', ['-e', script])) === null
      ? { ok: false, error: 'osascript nie odpowiedział' }
      : { ok: true };
  }

  if (platform === 'win32') {
    const code = action === 'next' ? 176 : action === 'prev' ? 177 : 179;
    const out = await sh(PS, [
      '-NoProfile',
      '-Command',
      `(New-Object -ComObject WScript.Shell).SendKeys([char]${code})`,
    ]);
    return out === null ? { ok: false, error: 'SendKeys nie powiodło się' } : { ok: true };
  }

  return { ok: false, error: 'Nieobsługiwany system.' };
}

/* ------------------------------------------------------------------ power */

export async function power(action) {
  if (dryRun) return { ok: true, note: 'dry-run' };

  if (platform === 'linux') {
    if (action === 'sleep') {
      const out = await sh('systemctl', ['suspend']);
      return out === null ? { ok: false, error: 'systemctl suspend wymaga uprawnień' } : { ok: true };
    }
    if (action === 'lock') {
      const out = await sh('loginctl', ['lock-session']);
      return out === null ? { ok: false, error: 'loginctl nie odpowiedział' } : { ok: true };
    }
    if (action === 'display-off') {
      const out = await sh('xset', ['dpms', 'force', 'off']);
      return out === null ? { ok: false, error: 'Brak xset / brak sesji X11' } : { ok: true };
    }
  }

  if (platform === 'darwin') {
    if (action === 'sleep') {
      return (await sh('pmset', ['sleepnow'])) === null
        ? { ok: false, error: 'pmset nie odpowiedział' }
        : { ok: true };
    }
    if (action === 'lock') {
      const script =
        'tell application "System Events" to keystroke "q" using {command down, control down}';
      return (await sh('osascript', ['-e', script])) === null
        ? { ok: false, error: 'osascript nie odpowiedział' }
        : { ok: true };
    }
    if (action === 'display-off') {
      return (await sh('pmset', ['displaysleepnow'])) === null
        ? { ok: false, error: 'pmset nie odpowiedział' }
        : { ok: true };
    }
  }

  if (platform === 'win32') {
    if (action === 'sleep') {
      const out = await sh('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0']);
      return out === null ? { ok: false, error: 'Uśpienie nie powiodło się' } : { ok: true };
    }
    if (action === 'lock') {
      const out = await sh('rundll32.exe', ['user32.dll,LockWorkStation']);
      return out === null ? { ok: false, error: 'Blokada nie powiodła się' } : { ok: true };
    }
  }

  return { ok: false, error: `Nieobsługiwana akcja zasilania: ${action}` };
}

/* ------------------------------------------------------------------- apps */

/** Lista aplikacji, które agent może otworzyć (bezpieczna allowlista). */
const APP_ALLOWLIST = /^[\w .\-+]+$/;

export async function launchApp(name) {
  const app = String(name ?? '').trim();
  if (!app || !APP_ALLOWLIST.test(app)) {
    return { ok: false, error: 'Niedozwolona nazwa aplikacji.' };
  }
  if (dryRun) return { ok: true, note: 'dry-run' };

  if (platform === 'darwin') {
    return (await sh('open', ['-a', app])) === null
      ? { ok: false, error: `Nie znaleziono aplikacji „${app}”.` }
      : { ok: true };
  }
  if (platform === 'win32') {
    const out = await sh(PS, ['-NoProfile', '-Command', `Start-Process "${app}"`]);
    return out === null ? { ok: false, error: `Nie udało się uruchomić „${app}”.` } : { ok: true };
  }
  const viaDesktop = await sh('gtk-launch', [app.toLowerCase().replace(/\s+/g, '-')]);
  if (viaDesktop !== null) return { ok: true };
  const out = await sh('sh', ['-lc', `nohup ${app} >/dev/null 2>&1 &`]);
  return out === null ? { ok: false, error: `Nie udało się uruchomić „${app}”.` } : { ok: true };
}

/* ------------------------------------------------------------------ state */

async function readLinuxFile(path) {
  try {
    return (await fs.readFile(path, 'utf8')).trim();
  } catch {
    return null;
  }
}

async function battery() {
  if (platform === 'linux') {
    const base = '/sys/class/power_supply';
    let entries = [];
    try {
      entries = await fs.readdir(base);
    } catch {
      return null;
    }
    const batteryDir = entries.find((entry) => entry.startsWith('BAT'));
    if (!batteryDir) return null;
    const capacity = Number(await readLinuxFile(`${base}/${batteryDir}/capacity`));
    const status = await readLinuxFile(`${base}/${batteryDir}/status`);
    if (!Number.isFinite(capacity)) return null;
    return { percent: capacity, charging: status === 'Charging' };
  }

  if (platform === 'darwin') {
    const out = await sh('pmset', ['-g', 'batt']);
    const match = out?.match(/(\d+)%/);
    if (!match) return null;
    return { percent: Number(match[1]), charging: Boolean(out?.includes('AC Power')) };
  }

  if (platform === 'win32') {
    const out = await sh(PS, [
      '-NoProfile',
      '-Command',
      'Get-CimInstance Win32_Battery | Select-Object -First 1 EstimatedChargeRemaining,BatteryStatus | ConvertTo-Json -Compress',
    ]);
    if (!out) return null;
    try {
      const parsed = JSON.parse(out);
      if (parsed?.EstimatedChargeRemaining == null) return null;
      return { percent: Number(parsed.EstimatedChargeRemaining), charging: parsed.BatteryStatus === 2 };
    } catch {
      return null;
    }
  }
  return null;
}

async function cpuPercent() {
  if (platform === 'win32') {
    const out = await sh(PS, [
      '-NoProfile',
      '-Command',
      '(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average',
    ]);
    const value = out && Number.parseFloat(out.replace(',', '.'));
    return Number.isFinite(value) ? Math.round(value) : null;
  }
  const load = os.loadavg()[0];
  const cores = os.cpus().length || 1;
  return Math.max(0, Math.min(100, Math.round((load / cores) * 100)));
}

async function temperature() {
  if (platform === 'linux') {
    const raw = await readLinuxFile('/sys/class/thermal/thermal_zone0/temp');
    const value = raw ? Number(raw) : NaN;
    return Number.isFinite(value) ? Math.round(value / 100) / 10 : null;
  }
  if (platform === 'win32') {
    const out = await sh(PS, [
      '-NoProfile',
      '-Command',
      '(Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature).CurrentTemperature',
    ]);
    const value = out ? Number(out.split(/\s+/)[0]) : NaN;
    return Number.isFinite(value) ? Math.round((value / 10 - 273.15) * 10) / 10 : null;
  }
  return null;
}

async function activeApp() {
  if (platform === 'linux') {
    const out = await sh('xdotool', ['getactivewindow', 'getwindowname'], 2000);
    return out || null;
  }
  if (platform === 'darwin') {
    return (
      (await sh(
        'osascript',
        ['-e', 'tell application "System Events" to get name of first application process whose frontmost is true'],
        2000,
      )) || null
    );
  }
  if (platform === 'win32') {
    const out = await sh(PS, [
      '-NoProfile',
      '-Command',
      'Get-Process | Where-Object { $_.MainWindowTitle } | Select-Object -First 1 -ExpandProperty ProcessName',
    ]);
    return out || null;
  }
  return null;
}

export async function getState() {
  const tools = await detectAudioTools();
  const [volume, batteryInfo, cpu, temp, app] = await Promise.all([
    getVolume(),
    battery(),
    cpuPercent(),
    temperature(),
    activeApp(),
  ]);

  const memTotal = os.totalmem();
  const memUsed = memTotal - os.freemem();

  return {
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`.trim(),
    arch: os.arch(),
    cpu: os.cpus()[0]?.model?.trim() ?? 'unknown',
    cpuCount: os.cpus().length,
    cpuPct: cpu,
    memPct: Math.round((memUsed / memTotal) * 100),
    tempC: temp,
    volume,
    volumeExact: tools.exact,
    audioBackend: tools.backend,
    battery: batteryInfo,
    activeApp: app,
    uptimeSec: Math.round(os.uptime()),
  };
}

export const platformInfo = () => ({ platform, arch: os.arch(), dryRun });
