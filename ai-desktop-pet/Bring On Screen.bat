@echo off
rem Use this if your pet or the summon button ever disappears.
rem It resets their positions, turns the pet back on, ends any pause, and summons the pet.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed yet. Install the LTS version from https://nodejs.org first.
  pause
  exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo First-time setup: downloading the pet engine. This takes a minute...
  call npm install
  if errorlevel 1 (
    echo Setup failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0" --bring-on-screen
exit /b 0
