# Prompt Used (verbatim, as required by the assignment)

> Take your own screenshots of the AI conversation as "Prompt execution evidence". Note: the assignment prompt refers to "[see attached image]" for a reference pet image. If you did not attach one, say so in your reflection; this project uses a built-in drawn placeholder pet that you can replace with `assets/pet.png`.

Build me a complete working animated desktop AI pet app for Windows/Mac.
This should not be a webpage demo. I want a real desktop pet that lives on top of my computer screen like old desktop companions.
Use Electron unless there is a better lightweight desktop-app choice.
I will provide one reference image of the pet character [see attached image]. Use it as the visual reference and make the final pet look as close as possible to that image. If only one image is provided, create convincing animation using transforms, bobbing, blinking, squash/stretch, walking motion, and entering/leaving animations. Keep the code structured so I can replace or add sprite frames later.

Core requirements:

1. Desktop pet window: transparent background; frameless window; always on top; no title bar; only the character should visually appear; must not look like a rectangular app window; should not block the whole screen; medium pet size by default; pet should appear near the bottom of the screen.

2. Animation: idle breathing/bobbing; blinking; walking motion; turning left/right; entering screen; leaving screen; occasional small wandering. Movement should feel cute and alive, not like a flat image sliding.

3. Visits/reminders: by default, every 5 minutes the pet should visit me. Pet walks onto screen, stops, shows a small speech bubble, then leaves after around 10-30 seconds. Do not use OS notifications. The reminder must come from the pet itself. Speech bubble must not cover the pet's face. Put the bubble beside the pet with a small pointer toward the character. Keep messages short and relevant. Message categories should mainly be: greeting/check-in, water reminder, stretch reminder, break reminder, mood/work check-in. Example messages: "Hi, how are you doing?" "Hi, checking in." "Hi, need a break?" "Hi, want some water?" "Hi, quick stretch?" "Hi, water check." "Hi, still doing okay?" Avoid irrelevant/random comments. The pet should feel helpful and companion-like.

4. Water reminders: include water reminders; let me change water reminder frequency in Settings.

5. Summon controls: add a small floating summon button on the edge of the desktop. It should use the pet/avatar icon, be visible and draggable, and clamp to the visible screen so it cannot disappear off-screen. Clicking it summons the pet immediately. Also add a system tray icon with: Summon Pet, Chat, Settings, Pause Pet, Quit.

6. Chat: clicking the pet opens a compact chat box next to it. The chat should feel like part of the pet, not a big ChatGPT interface. Include: previous messages in current conversation, text input, send button, close button. Basic/offline mode should respond naturally to greetings like: "hi", "nice to meet you", "how are you", "I'm tired", "I need water", "I'm stressed". Responses should be short, warm, and relevant.

7. AI mode: support two modes: Basic mode (works without an API key using built-in responses) and AI mode (uses OpenAI API if I add an API key). Store API key securely, never hard-code it. Put pet personality in a separate editable config file. Use this personality: "You are a tiny desktop companion. You are friendly, slightly playful and concise. You help the user remember to drink water, stretch and take breaks, but you are not annoying or overly enthusiastic. Most responses should be 1-2 sentences. Talk like a small companion sitting on the user's desktop, not like an AI assistant."

8. Settings screen: simple settings screen with: enable/disable pet; visit frequency (5 min, 10 min, 15 min, 30 min, 1 hour, custom); water reminder frequency; check-ins on/off; sound on/off; animation speed; pet size; AI chat on/off; API key; launch when computer starts; always on top; quiet hours.

9. Quiet mode: allow pause for 30 minutes, pause for 1 hour, pause until tomorrow, resume. During pause, random visits stop, but manual summon still works.

10. Local persistence: save locally settings, reminder timing, pet size, summon button position, quiet hours. Conversation history does not need to persist after closing.

11. Usability: assume I am not technical. Provide a complete project folder, a simple launcher script I can double-click, a "bring on screen" launcher that resets pet/button position if they disappear, and a README explaining how to run it.

Important implementation details: use a transparent frameless always-on-top Electron window for the pet; use a separate tiny always-on-top draggable window for the summon button; use system tray controls; use local config files for messages and personality; keep CPU usage low when idle/hidden; validate the app launches successfully.
