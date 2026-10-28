#!/bin/bash
# Use this (macOS) if your pet or the summon button ever disappears.
# It resets their positions, turns the pet back on, ends any pause, and summons the pet.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed yet. Install the LTS version from https://nodejs.org first."
  read -r -p "Press Enter to close..." _
  exit 1
fi

if [ ! -x "node_modules/.bin/electron" ]; then
  echo "First-time setup: downloading the pet engine. This takes a minute..."
  npm install || { echo "Setup failed. Check your internet connection."; read -r -p "Press Enter to close..." _; exit 1; }
fi

nohup ./node_modules/.bin/electron . --bring-on-screen >/dev/null 2>&1 &
disown
exit 0
