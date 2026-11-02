@echo off
setlocal
chcp 65001 >nul
title MyPilot - uruchamianie

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Nie znaleziono Node.js.
  echo   Pobierz wersje LTS z https://nodejs.org i uruchom ten plik ponownie.
  echo.
  pause
  exit /b 1
)

cd /d "%~dp0"

if not exist "node_modules" (
  echo   Instaluje zaleznosci - pierwszy start moze potrwac minute...
  call npm install
  if errorlevel 1 (
    echo.
    echo   Instalacja nie powiodla sie. Sprawdz polaczenie z internetem.
    echo.
    pause
    exit /b 1
  )
)

echo   Uruchamiam serwer MyPilot...
start "MyPilot - serwer" cmd /k "npm run dev"
timeout /t 4 /nobreak >nul

echo   Uruchamiam agenta na tym komputerze...
start "MyPilot - agent (skopiuj token)" cmd /k "npm run agent"
timeout /t 3 /nobreak >nul

start "" http://localhost:5173

echo.
echo   ============================================================
echo    MyPilot dziala:  http://localhost:5173
echo.
echo    Token agenta znajdziesz w oknie "MyPilot - agent".
echo    Wklej go w aplikacji: Ustawienia -^> Agent MyPilot.
echo.
echo    Zamkniecie: zamknij oba okna terminala.
echo   ============================================================
echo.
pause
