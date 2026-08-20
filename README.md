# Terra Bell Schedule — deployment guide

## What this is
A installable web app (PWA) that shows the current period, a countdown ring, and plays a two-tone chime at every period change. Built for the Terra School at Serenbe Monday–Friday schedule.

## 1. Deploy to GitHub Pages (free, ~10 minutes, one time)

1. Create a free GitHub account at github.com if you don't have one.
2. Create a new **public** repository, e.g. `terra-bell-schedule`.
3. Upload every file in this folder to the repository root (drag-and-drop works on github.com — use "Add file > Upload files").
4. Go to the repo's **Settings > Pages**.
5. Under "Build and deployment," set Source = "Deploy from a branch," Branch = `main`, folder = `/ (root)`. Save.
6. Wait 1–2 minutes. GitHub will give you a URL like:
   `https://YOUR-USERNAME.github.io/terra-bell-schedule/`

That URL is what every device loads.

## 2. Install it on each of the 3 rooms' devices

- **On a smart TV browser or a phone (Chrome/Android):** open the URL, then use the browser menu → "Install app" or "Add to Home Screen."
- **On iPhone/iPad (Safari):** open the URL, tap Share → "Add to Home Screen."
- Once installed, launching it from the home screen icon runs full-screen, no browser bars.
- On the first load each session, tap **"Enable sound & start."** This is required — browsers block audio until a person interacts with the page at least once. There is no way around this; it is a browser security rule, not a bug in this app.

## 3. Changing the schedule times later

Edit `schedule.json` directly on github.com (click the file, click the pencil icon, edit, commit). GitHub Pages redeploys automatically within about a minute. Every installed device will pick up the new times:
- Immediately, if the device is reloaded
- Automatically within 5 minutes otherwise (the app quietly re-checks `schedule.json` every 5 minutes)

**Important limitation, stated plainly:** this app has no shared backend/database. Editing the schedule from a phone in the classroom does **not** push live to the other two rooms in real time — someone has to edit `schedule.json` in the GitHub repository itself (from any device with a browser), and the other rooms pick it up on their next reload or 5-minute check. If you want true "any teacher edits from their phone and it updates everywhere instantly," that requires adding a real backend (e.g., Firebase Realtime Database — free tier, but a separate setup step). Say the word if you want that added.

## 4. Keeping the bell reliable on each device

- **Do not let the tab/app sleep.** On TVs, disable auto-sleep or screensaver for the browser, or use a "keep screen on" setting. On phones, disable auto-lock while the app is the active display, or plug the phone in and use a stand.
- **Check each device's clock.** The app trusts the device's own system clock — it does not fetch true time from a server. If a TV's clock is 3 minutes fast, its bell will ring 3 minutes early relative to the other rooms. Set all 3 devices to automatic network time (not manually set) and confirm they match.
- **Weekends:** the app automatically shows "No school today" on Saturday/Sunday and does not chime.

## Files in this folder
- `index.html`, `style.css`, `app.js` — the app
- `schedule.json` — the editable period times
- `manifest.json`, `service-worker.js`, `icon-192.png`, `icon-512.png` — make it installable and work offline
