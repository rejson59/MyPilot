# MyPilot Agent

Mały lokalny serwer, który pozwala MyPilotowi sterować **prawdziwym komputerem**: głośnością, multimediami, aplikacjami i usypianiem. Zero zależności, zero chmury.

```
MyPilot (serwer)  ──HTTP + token──▶  Agent na PC  ──▶  system (pactl / osascript / PowerShell)
```

## Uruchomienie

```bash
node agent/index.mjs       # albo: npm run agent
```

W konsoli zobaczysz adres i token:

```
  Adres:  http://127.0.0.1:8790
  Token:  9f3c1d0a…
```

Wklej oba w **MyPilot → Ustawienia → Agent MyPilot**, włącz integrację, kliknij **Testuj**.

> Agent domyślnie nasłuchuje tylko na `127.0.0.1`. Jeśli MyPilot działa na innym urządzeniu w sieci, ustaw `MYPILOT_AGENT_HOST=0.0.0.0` — token nadal chroni endpointy.

## Co działa na jakim systemie

| Funkcja | Linux | macOS | Windows |
| --- | --- | --- | --- |
| Głośność (odczyt i ustawianie) | `pactl` lub `amixer` | `osascript` | moduł **AudioDeviceCmdlets** lub `nircmd` |
| Wyciszenie | `pactl` | `osascript` | AudioDeviceCmdlets / `nircmd` |
| Play / pauza / następny | `playerctl` | klawisze System Events | klawisze multimedialne |
| Aplikacje | `gtk-launch` / PATH | `open -a` | `Start-Process` |
| Uśpienie | `systemctl suspend` | `pmset sleepnow` | `rundll32 powrprof` |
| Blokada ekranu | `loginctl lock-session` | Ctrl+Cmd+Q | `LockWorkStation` |
| CPU / RAM / bateria / temp. | pełne | CPU, RAM, bateria | CIM (CPU, bateria) |

Instalacja na Linux:

```bash
sudo apt install pulseaudio-utils playerctl      # Debian/Ubuntu
sudo dnf install pulseaudio-utils playerctl      # Fedora
```

Windows — dokładna głośność:

```powershell
Install-Module AudioDeviceCmdlets -Scope CurrentUser
# albo pobierz nircmd i dodaj do PATH
```

## Konfiguracja (zmienne środowiskowe)

| Zmienna | Domyślnie | Znaczenie |
| --- | --- | --- |
| `MYPILOT_AGENT_PORT` | `8790` | port HTTP |
| `MYPILOT_AGENT_HOST` | `127.0.0.1` | interfejs nasłuchu (`0.0.0.0` = sieć lokalna) |
| `MYPILOT_AGENT_TOKEN` | losowy, zapisany w `.agent-token` | token dostępu |
| `MYPILOT_AGENT_DRY_RUN` | `0` | `1` = nic nie wykonuje, tylko odpowiada `ok` (bezpieczne testy) |

## API

Wszystkie endpointy poza `/health` wymagają nagłówka `X-MyPilot-Token`.

| Metoda | Ścieżka | Opis |
| --- | --- | --- |
| GET | `/health` | Wersja, platforma, dostępne backendy audio (bez tokenu) |
| GET | `/state` | Hostname, CPU, RAM, temperatura, głośność, bateria, aktywna aplikacja |
| POST | `/volume` | `{ "level": 0–100 }` |
| POST | `/mute` | `{ "muted": true/false }` (puste = przełącz) |
| POST | `/media` | `{ "action": "play-pause" \| "next" \| "prev" }` |
| POST | `/power` | `{ "action": "sleep" \| "lock" \| "display-off" }` |
| POST | `/apps/launch` | `{ "name": "Spotify" }` — nazwa z allowlisty znaków |

Świadomie **nie ma** wyłączania i restartu komputera — zbyt łatwo o przypadkowe kliknięcie.

## Autostart

**Linux (systemd user):** `~/.config/systemd/user/mypilot-agent.service`

```ini
[Unit]
Description=MyPilot Agent
After=network.target

[Service]
ExecStart=/usr/bin/node /home/TWOJ_USER/MyPilot/agent/index.mjs
Restart=on-failure

[Install]
WantedBy=default.target
```

```bash
systemctl --user enable --now mypilot-agent
```

**macOS:** dodaj `node /ścieżka/agent/index.mjs` do Login Items albo stwórz `~/Library/LaunchAgents/pl.mypilot.agent.plist`.

**Windows:** Harmonogram zadań → „Utwórz zadanie” → akcja `node.exe` z argumentem `C:\...\agent\index.mjs` → „Uruchom przy logowaniu”.

## Bezpieczeństwo

- Token jest porównywany w czasie stałym (`timingSafeEqual`).
- Nazwy aplikacji przechodzą przez allowlistę znaków (bez `;`, `&`, `|`).
- Agent nie ma endpointu do powłoki — nie da się przez niego wykonać dowolnego polecenia.
- Nie wystawiaj agenta na internet. Do zdalnego dostępu użyj VPN (WireGuard/Tailscale).

## Diagnostyka

**Głośność się nie zmienia na Linux:** sprawdź `pactl info` — jeśli nie ma serwera dźwięku, agent zwróci błąd i MyPilot pokaże go w dzienniku.

**Testuję bez ryzyka:** uruchom z `MYPILOT_AGENT_DRY_RUN=1`.

**Token nie pasuje:** usuń `agent/.agent-token` i uruchom ponownie albo ustaw własny przez `MYPILOT_AGENT_TOKEN`.
