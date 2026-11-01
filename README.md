# MyPilot

**Jeden pilot do wszystkiego, co ma prąd.** Światło, LED-y, głośnik, TV, klimatyzacja, komputer, laptop, telefon, tablet, gniazdko i roleta — w jednej aplikacji, która wygląda jak produkt, a nie panel administracyjny.

Działa od razu w trybie demo (bez ani jednego urządzenia), a architektura jest przygotowana na podłączenie prawdziwego sprzętu: mostka IR, głośnika Bluetooth, agenta na PC i Home Assistant.

---

## Co potrafi

- **Pokój na żywo** — kafle urządzeń z aktualnym stanem, suwakami jasności/głośności i przełącznikami. Stan leci przez WebSocket (1 s), z fallbackiem na polling, gdy sieć zerwie.
- **6 scen** — Praca, Film, Sen, Impreza, Gaming, Wychodzę. Jedno dotknięcie zmienia kilkanaście urządzeń naraz. Scena podświetla się, gdy pokój faktycznie jest w jej stanie.
- **4 automatyzacje** — reguły czasowe (23:30, 7:00) i sprzężone ze stanem urządzenia („TV włączony → przygaś światło”). Można je włączać i uruchamiać ręcznie.
- **Panel urządzenia** — dedykowane sterowanie per typ: temperatura barwowa i kolory LED, odtwarzacz z parowaniem Bluetooth, pilot IR z D-padem, termostat klimy, Wake-on-LAN i aplikacje na PC, pierścień baterii telefonu.
- **Energia** — pobór na żywo, koszt dnia i miesiąca, historia 8 dni, wykres 2 minut, ranking największych pożeraczy prądu.
- **Polecenia** — `⌘K` / `Ctrl+K`, wyszukiwanie urządzeń i scen, nawigacja z klawiatury.
- **Prawdziwy agent** — `npm run agent` na komputerze daje realną głośność, multimedia, CPU, baterię, uruchamianie aplikacji, uśpienie i Wake-on-LAN. Bez chmury, po tokenie.
- **Własne urządzenia** — kreator „Dodaj urządzenie” (8 szablonów) i uniwersalny pilot IR z edytorem kodów. Dodasz taśmę LED z Action, lampę Wi-Fi czy gniazdko bez dotykania kodu.
- **PWA** — instalacja na telefonie/tablecie, działanie offline dla powłoki aplikacji.
- **PL / EN**, jasny/ciemny motyw (także automatyczny), pełna responsywność: telefon → tablet → desktop.

## Szybki start

```bash
npm install
npm run dev
```

- Interfejs: **http://localhost:5173**
- API + WebSocket: `http://127.0.0.1:8787` (Vite proxuje `/api` i `/ws`)

Produkcja:

```bash
npm run build
npm start        # serwuje dist/ + API na jednym porcie 8787
```

Inne skrypty: `npm run agent` (agent na komputer), `npm run typecheck`, `npm run icons`, `npm run smoke` (test renderowania — wymaga uruchomionego serwera).

## Demo czy prawdziwy sprzęt?

Przełącznik w **Ustawienia → Tryb pracy**. Tryb demo nie wymaga niczego i pokazuje pełną funkcjonalność. Tryb live sprawia, że polecenia idą do adapterów.

| Adapter | Stan w tej wersji |
| --- | --- |
| Symulator pokoju | Pełny — 12 urządzeń, energia, automatyzacje |
| Mostek IR (ESP32/Tasmota, REST) | **Działa** — realne żądania HTTP, kody Samsung NEC dla power/vol/mute |
| Głośnik Bluetooth (Linux) | **Działa** — `bluetoothctl` + `pactl` do głośności |
| Home Assistant | **Test połączenia i wywołania usług** przez REST API z tokenem |
| MQTT | Zapis konfiguracji i walidacja adresu; publikacja/subskrypcja to kolejny krok |
| Agent MyPilot (PC / laptop) | **Działa** — `npm run agent`, głośność, multimedia, aplikacje, CPU, uśpienie; Wake-on-LAN z serwera |

Komputer ma już prawdziwego agenta. Telefon i tablet nadal są symulowane — aplikacja pokazuje docelowy interfejs i ma gotowe miejsce na companion appkę (ADB na Androidzie).

## Podłączenie sprzętu

### 1. Podczerwień (TV, klimatyzacja)

1. Kup **ESP32 + diodę IR** (ok. 30 zł) albo Broadlink RM4.
2. Wgraj **Tasmotę** i włącz `IRsend`.
3. W Ustawieniach wpisz adres mostka (np. `http://192.168.1.60`) i wybierz format `Tasmota`.
4. Kliknij **Testuj** — powinno odpowiedzieć.

W `server/adapters.ts` są kody Samsunga dla `power`, `vol+`, `vol-`, `mute`. **Kody nawigacji nie są zgadywane** — dla swojego modelu przechwyć je pilotem i dopisz do mapy. Aplikacja w trybie live powie wprost, którego kodu brakuje.

### 1a. Taśma LED Grundig z Action (i podobne)

Te taśmy (5 m, ~40 zł, z pilotem) to **zwykle zwykłe RGB na podczerwień**, a nie Wi-Fi jak LSC Smart Connect. Sprawdź to w 5 sekund: skieruj pilot w **kamerę telefonu** i naciśnij przycisk — fioletowa dioda w obiektywie oznacza IR. Jeśli pilot działa przez ścianę i bez celowania, to RF 433 MHz (wtedy potrzebny Broadlink RM4 Pro z RF; nie ma go jeszcze w adapterach).

Dla IR:

1. Podłącz mostek IR (patrz wyżej).
2. **Dodaj urządzenie → Taśma LED z pilotem**.
3. W Tasmota włącz `IRrecv`, naciśnij przycisk pilota — w konsoli pojawi się kod (`{"Protocol":"NEC","Bits":32,"Data":"0x00FF906F"}`).
4. Otwórz urządzenie w MyPilot → **Kody IR** → wklej kod przy przycisku → **Zapisz kody**.

Bez kodów taśma działa w trybie demo (przyciski zmieniają stan w aplikacji). Z kodami tryb live wysyła je naprawdę. Kolory i efekty są edytowalne — to tylko lista przycisków w `meta.buttons`.

Jeśli Twoja taśma jednak ma Wi-Fi (inny model), dodaj ją przez Home Assistant z integracją Tuya — MyPilot podłączy się do HA jednym tokenem.

### 2. Głośnik Bluetooth

```bash
sudo apt install bluez pulseaudio-utils
bluetoothctl scan on       # znajdź MAC głośnika
```

MAC, nazwę i adapter (`hci0`) wpisz w Ustawieniach, włącz integrację i sprawdź **Testuj**. Parowanie i rozłączanie w panelu głośnika wołają `bluetoothctl`; suwak głośności ustawia `pactl`.

### 3. Home Assistant (opcjonalnie)

1. Home Assistant → profil → **Long-lived access token**.
2. Wklej URL (`http://homeassistant.local:8123`) i token w Ustawieniach.
3. **Testuj** — dostaniesz informację, czy HA przyjął token.

Hub pozwala dodać setki urządzeń (Zigbee, Wi-Fi, chmury) bez pisania integracji. W aplikacji jest przycisk **Jak to działa**, który wyjaśnia to po ludzku.

### 4. Komputer (agent)

```bash
npm run agent        # albo: node agent/index.mjs
```

Agent wypisze w konsoli adres i token. Wklej je w **Ustawienia → Agent MyPilot**, włącz integrację i kliknij **Testuj**. Od tej chwili (w trybie live) suwak głośności, multimedia, CPU i aplikacje na PC są prawdziwe, a „Obudź” wysyła magic packet Wake-on-LAN (wymaga MAC w urządzeniu i WoL w BIOSie).

Obsługiwane systemy i wymagane narzędzia (Linux: `pactl`/`playerctl`, macOS: wbudowane, Windows: `AudioDeviceCmdlets` lub `nircmd`), autostart i diagnostyka — w **[agent/README.md](agent/README.md)**. Telefon i tablet pozostają symulowane do czasu companion appki.

## Architektura

```
przeglądarka (React + Vite + PWA)
        │  REST /api/*          WebSocket /ws
        ▼
serwer Node (Express + ws)
  ├── state.ts      stan pokoju, model poboru prądu, energia,
  │                 automatyzacje, dziennik zdarzeń, zapis do data/
  ├── seed.ts       domyślny pokój, sceny, reguły
  ├── adapters.ts   IR (HTTP), Bluetooth (bluetoothctl), Home Assistant (REST)
  └── config.ts     konfiguracja + maskowanie sekretów
```

Serwer trzyma stan w pamięci i zapisuje go co 10 s do `data/state.json`. Cała komunikacja z urządzeniami przechodzi przez jedno miejsce (`applyPatch` / `command`), więc dodanie adaptera nie rusza interfejsu.

### API

| Metoda | Ścieżka | Opis |
| --- | --- | --- |
| GET | `/api/snapshot` | Pełny stan: urządzenia, sceny, automatyzacje, energia |
| PATCH | `/api/devices/:id` | Zmiana stanu (jasność, głośność, temperatura…) z walidacją |
| POST | `/api/devices/:id/command` | `toggle`, `play`, `next`, `ir-key`, `wake`, `bt-connect`… |
| POST/DELETE | `/api/devices` · `/api/devices/:id` | Dodanie / usunięcie własnego urządzenia |
| PATCH | `/api/devices/:id/info` | Nazwa, strefa, model, kody IR (`meta.buttons`) |
| POST | `/api/scenes/:id/apply` | Wykonanie sceny |
| PATCH | `/api/automations/:id` | Włącz/wyłącz regułę |
| POST | `/api/automations/:id/run` | Uruchomienie ręczne |
| GET/PUT | `/api/config` | Konfiguracja (tokeny nigdy nie wracają do klienta) |
| POST | `/api/config/test` | Test mostka IR / BT / HA / MQTT |
| POST | `/api/bluetooth/scan` | Lista urządzeń BT |
| POST | `/api/system/reset` | Powrót do pokoju demo |

## Struktura

```
agent/             samodzielny agent na komputer (Node, zero zależności)
server/            backend: stan, adaptery, API, WebSocket
shared/types.ts    kontrakt danych serwer ↔ klient
src/
  App.tsx          powłoka: nawigacja, motyw, skróty, połączenie live
  components/      kafle, panel urządzenia, polecenia, UI
  views/           Sceny, Automatyzacje, Energia, Ustawienia
  lib/             API, store (zustand), i18n, formatowanie
  index.css        design tokens + cały layout (bez frameworka CSS)
public/            manifest PWA, service worker, ikony
data/              stan, konfiguracja i własne urządzenia (poza gitem!)
```

## Bezpieczeństwo

- `data/` jest w `.gitignore` — **tokeny Home Assistanta i hasła MQTT nie trafiają do repozytorium**.
- API nie ma autoryzacji, bo jest przeznaczone do sieci lokalnej. **Nie wystawiaj portu 8787 na internet** — jeśli potrzebujesz dostępu z zewnątrz, postaw VPN (WireGuard/Tailscale).
- Konfiguracja jest maskowana przy odczycie: klient widzi tylko `hasToken` / `hasPassword`.
- Token agenta jest porównywany w czasie stałym, a agent nie udostępnia powłoki — tylko wąski zestaw akcji. Domyślnie słucha na `127.0.0.1`.

## Pomysły na dalej

- Companionapp na Androida (obecnie telefon i tablet są symulowane).
- Kreator automatyzacji (warunki, harmonogramy, obecność).
- Adapter RF 433 MHz (Broadlink RM4 Pro) dla taśm z pilotem radiowym.
- Nauka kodów IR jednym kliknięciem (przechwycenie z mostka zamiast wklejania).
- Integracja MQTT i auto-discovery Tasmota.
- Sceny uczące się z historii („tak zwykle robisz o 22:00”).
- Wsparcie dla żarówek Hue i czujników Zigbee przez Home Assistant.
