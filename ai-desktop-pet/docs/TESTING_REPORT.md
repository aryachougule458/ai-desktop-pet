# Testing Report (template, fill in on your own computer)

**Student:** ______  **OS / version:** ______  **Date:** ______  **Electron/Node versions:** ______

Run each test on your own Windows/Mac machine, record Pass/Fail, and attach a screenshot (file name in the last column). Tip: set visit frequency to *Custom: 1 minute* to see automatic visits quickly.

## A. Automated check (already run by the developer tooling)

`npm run selftest` launches the app headlessly and checks: windows created, tray created, summon button inside screen and clamped when pushed off-screen, basic replies for the six required phrases, a visit shows a speech bubble, chat opens, settings/pause/timing are saved to disk. Result of the run made while building this project (Linux, virtual display): **PASS**. This does not replace testing on a real Windows/Mac desktop.

## B. Manual test cases

| # | Scenario | Steps | Expected | Pass/Fail | Evidence | Notes |
|---|---|---|---|---|---|---|
| 1 | Launch | Double-click Start Pet | App starts, tray icon + summon button appear | | | |
| 2 | Pet appears correctly | Click summon button | Transparent pet, no window frame, near bottom of screen | | | |
| 3 | Animation | Watch the pet | Breathing, blinking, hopping walk, turning, enter/leave | | | |
| 4 | Automatic visit | Set custom 1 min, wait | Pet walks in, bubble beside pet (not over face), leaves after 10-30 s | | | |
| 5 | Change frequency | Settings > Visit frequency | New interval takes effect | | | |
| 6 | Water reminder | Settings > Water: every 15 min (or wait) | "Water" message appears from the pet | | | |
| 7 | Manual summon | Tray > Summon Pet | Pet comes immediately | | | |
| 8 | Move summon button | Drag to another edge/middle | Moves smoothly, stays on screen, click still summons | | | |
| 9 | Button clamp | Drag past the screen edge | Button stays fully visible | | | |
| 10 | Open chat | Click the pet | Compact chat beside the pet | | | |
| 11 | Basic replies | Type: hi / nice to meet you / how are you / I'm tired / I need water / I'm stressed | Short warm relevant replies | | | |
| 12 | Tray options | Right-click tray icon | Summon Pet, Chat, Settings, Pause Pet, Quit all work | | | |
| 13 | Size & speed | Change pet size and animation speed | Applied immediately | | | |
| 14 | Enable/disable | Untick "Enable pet" | Pet and button hide; no visits | | | |
| 15 | Quiet mode | Pause 30 min; wait past a visit time; then summon manually | No random visit; manual summon works; Resume restores | | | |
| 16 | Quiet hours | Set a range covering now | No random visits during the range | | | |
| 17 | AI mode (optional) | Save an API key, turn AI chat on | Replies come from AI in 1-2 sentences; wrong key falls back to basic with a note | | | |
| 18 | Persistence | Change settings, move button, Quit, restart | Settings, size, button position kept | | | |
| 19 | Recovery launcher | Drag button off or hide pet, run Bring On Screen | Button reset to right edge, pet appears | | | |
| 20 | Idle CPU | Check Task Manager / Activity Monitor while the pet is away | Near 0% CPU | | | |

## C. Bugs found and fixes

| Bug | How found | Fix | Re-test result |
|---|---|---|---|
| | | | |

(While building this project, one issue was found and fixed in the headless run: speech-bubble text wrapped one word per line; it was fixed with a CSS width rule.)

## D. Conclusion

______
