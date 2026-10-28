# AI Desktop Pet

A small animated companion that lives on top of your desktop (Windows / macOS). It walks onto the screen every few minutes, shows a short speech bubble (water, stretch, break, check-in), and leaves again. Click it to chat. It works fully offline, and can optionally use OpenAI for smarter replies.

The default pet is a drawn orange cat-like placeholder, because no reference image was supplied. See "Use your own pet image" below.

## 1. Start it (no technical knowledge needed)

**First time only:** install Node.js (the LTS version) from https://nodejs.org.

| Computer | Double-click |
|---|---|
| Windows | `Start Pet.bat` |
| Mac | `Start Pet.command` |

The first start downloads the pet engine (about a minute, needs internet). After that it starts instantly. A small window may flash and close; that is normal.

**Mac note:** if macOS says the file can't be opened, right-click it, choose *Open*, then *Open* again. If it says "permission denied", open Terminal in this folder and run `chmod +x *.command`.

When it is running you will see:
- the pet walking in from the side of the screen near the bottom,
- a small round **summon button** at the right edge of the screen,
- a **tray icon** (Windows: bottom-right near the clock, may be under the ^ arrow. Mac: top menu bar).

## 2. Using the pet

| What | How |
|---|---|
| Summon the pet now | Click the round button, or tray icon menu > **Summon Pet** |
| Move the summon button | Drag it anywhere. It always stays on screen and remembers its place |
| Chat | Click the pet (or the speech bubble), or tray > **Chat** |
| Send the pet away | Right-click the pet > **Send away** |
| Settings | Tray > **Settings**, or right-click the pet |
| Pause | Tray > **Pause Pet** > 30 minutes / 1 hour / until tomorrow (8:00 AM) / Resume |
| Quit | Tray > **Quit** |

The pet visits every **5 minutes** by default and stays 10-30 seconds. Water reminders have their own timer (every 30 minutes by default). Both can be changed in Settings. Reminders come from the pet itself, never from system notifications.

While paused (or during quiet hours) random visits stop, but summoning the pet by hand still works.

## 3. If the pet or button disappears

Double-click **`Bring On Screen.bat`** (Windows) or **`Bring On Screen.command`** (Mac). It puts the button back at the right edge, turns the pet on, ends any pause, and summons the pet. The same action is in Settings > Tools.

## 4. Settings

Pet on/off, visit frequency (5, 10, 15, 30, 60 min or custom), water reminder frequency, check-ins on/off, sound, animation speed, pet size, AI chat on/off, API key, launch at startup, always on top, quiet hours, and Quiet mode pause buttons. Changes save instantly.

Saved on your computer: settings, reminder timing, pet size, summon button position, quiet hours. Chat history is **not** saved after you quit.

Data file location: Windows `%APPDATA%\ai-desktop-pet\pet-data.json`, Mac `~/Library/Application Support/ai-desktop-pet/pet-data.json`.

## 5. Chat modes

- **Basic mode (default):** works with no internet and no key. Replies come from `config/responses.json`.
- **AI mode:** open Settings, paste your OpenAI API key, press **Save**. AI chat turns on automatically. The key is encrypted with your operating system's secure storage and is never written into any project file. If the AI can't be reached, the pet quietly falls back to basic replies and says so once.

Advanced option: instead of the Settings box you can set an `OPENAI_API_KEY` environment variable.

## 6. Customising (all plain text files in `config/`)

| File | What it controls |
|---|---|
| `personality.json` | The pet's name, AI personality text, model name, reply length |
| `messages.json` | Visit and reminder messages, and how long a visit lasts (10-30 s) |
| `responses.json` | Basic-mode chat replies (edit or add rules) |
| `sprites.json` | Pet image and optional animation frames |

Restart is not needed for message/personality/response edits.

### Use your own pet image
1. Put a **transparent PNG** of your character named `pet.png` in the `assets` folder (about 400 x 400 px works well, facing right).
2. Restart the pet. The animation (breathing, hopping, squash/stretch, turning, entering/leaving) is applied to your image. The summon button uses your image too.
3. For real frame-by-frame animation later, add files such as `walk1.png`, `walk2.png` to `assets` and list them under `frames` in `config/sprites.json`.

## 7. Making a standalone app (optional)

`npm run dist` builds an installer/portable app for the computer you run it on (Windows `.exe`, Mac `.dmg`) into the `dist` folder. Build on Windows for Windows and on a Mac for Mac.

## 8. Troubleshooting

- **Nothing appears:** the pet only appears at visit time. Click the round button, or tray > Summon Pet. If you see nothing at all, run `Bring On Screen`.
- **Tray icon hidden (Windows):** click the ^ arrow next to the clock.
- **Can't click through to windows behind the pet:** the pet window is click-through except on the pet itself. If this is not the case on your system, tell your instructor/developer which OS you use.
- **Linux:** not a target platform. The app starts, but the transparent strip can't be click-through there.

## 9. Project layout

```
main.js          main process: windows, tray, scheduler, settings, chat, secure key
preload.js       safe bridge between windows and main process
src/             pet / summon button / settings windows (html, css, js)
config/          personality, messages, chat replies, sprites (editable)
assets/          icon.png, tray.png, and your optional pet.png
docs/            prompt, testing report template, reflection template
Start Pet.*      double-click launchers
Bring On Screen.*  recovery launchers
npm run selftest   headless automated check (developer use)
```
