(() => {
  const RING_CIRCUMFERENCE = 2 * Math.PI * 135; // matches r=135 in the SVG

  const els = {
    overlay: document.getElementById("unlock-overlay"),
    unlockBtn: document.getElementById("unlock-btn"),
    silentBtn: document.getElementById("silent-btn"),
    app: document.getElementById("app"),
    clockTime: document.getElementById("clock-time"),
    ringProgress: document.getElementById("ring-progress"),
    blockLabel: document.getElementById("block-label"),
    countdown: document.getElementById("countdown"),
    subLabel: document.getElementById("sub-label"),
    nextUp: document.getElementById("next-up"),
    editToggle: document.getElementById("edit-toggle"),
    schedulePanel: document.getElementById("schedule-panel"),
    scheduleList: document.getElementById("schedule-list"),
    closePanel: document.getElementById("close-panel"),
  };

  let audioCtx = null;
  let soundEnabled = false;
  let blocksToday = [];
  let lastStateKey = null; // used to detect boundary crossings for the chime
  let hasTicked = false;   // suppress a chime on the very first render after page load
  let scheduleRaw = null;

  // ---------- Audio ----------
  function unlockAudio() {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      // Play a near-silent blip to fully unlock on iOS/tvOS browsers.
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      gain.gain.value = 0.0001;
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.05);
      soundEnabled = true;
    } catch (e) {
      soundEnabled = false;
    }
  }

  function playChime() {
    if (!soundEnabled || !audioCtx) return;
    const now = audioCtx.currentTime;
    // Two-tone bell: a bright strike plus a lower sustain, twice.
    [0, 0.55].forEach((offset) => {
      const strike = audioCtx.createOscillator();
      const sustain = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      strike.type = "sine";
      sustain.type = "sine";
      strike.frequency.setValueAtTime(1046.5, now + offset);   // C6
      sustain.frequency.setValueAtTime(523.25, now + offset);  // C5

      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.5, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.5);

      strike.connect(gain);
      sustain.connect(gain);
      gain.connect(audioCtx.destination);

      strike.start(now + offset);
      sustain.start(now + offset);
      strike.stop(now + offset + 0.55);
      sustain.stop(now + offset + 0.55);
    });
  }

  // ---------- Schedule handling ----------
  function timeToDate(hhmm, base) {
    const [h, m] = hhmm.split(":").map(Number);
    const d = new Date(base);
    d.setHours(h, m, 0, 0);
    return d;
  }

  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  function blocksForDay(schedule, now) {
    const dayName = DAY_NAMES[now.getDay()];
    const overrides = (schedule.dayOverrides && schedule.dayOverrides[dayName]) || [];

    let blocks = schedule.blocks.slice();

    overrides.forEach((ov) => {
      const idx = blocks.findIndex((b) => b.label === ov.replaceLabel);
      if (idx !== -1) {
        blocks.splice(idx, 1, ...ov.with);
      }
      // If replaceLabel isn't found (e.g. someone renamed "Specials" later),
      // the override is silently skipped rather than breaking the schedule —
      // worth checking dayOverrides after renaming any block label.
    });

    return blocks;
  }

  function buildTodayBlocks(schedule, now) {
    return blocksForDay(schedule, now).map((b) => ({
      ...b,
      startDate: timeToDate(b.start, now),
      endDate: timeToDate(b.end, now),
    }));
  }

  function findCurrentIndex(blocks, now) {
    for (let i = 0; i < blocks.length; i++) {
      if (now >= blocks[i].startDate && now < blocks[i].endDate) return i;
    }
    return -1;
  }

  function findNextIndex(blocks, now) {
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i].startDate > now) return i;
    }
    return -1;
  }

  function fmtClock(d) {
    let h = d.getHours();
    const m = d.getMinutes().toString().padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12; if (h === 0) h = 12;
    return `${h}:${m} ${ampm}`;
  }

  function fmtCountdown(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function fmtHHMMTo12Hour(hhmm) {
    const [hRaw, m] = hhmm.split(":").map(Number);
    const ampm = hRaw >= 12 ? "PM" : "AM";
    let h = hRaw % 12;
    if (h === 0) h = 12;
    return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
  }

  function colorClassFor(type) {
    if (type === "transition") return "transition";
    if (type === "lunch") return "lunch";
    return "";
  }

  // ---------- Render loop ----------
  function tick() {
    const now = new Date();
    const day = now.getDay(); // 0 Sun ... 6 Sat

    els.clockTime.textContent = fmtClock(now);

    if (day === 0 || day === 6) {
      renderIdle("No school today");
      registerState("idle-weekend", now, false);
      return;
    }

    // Rebuild today's block Date objects if the date has rolled over.
    if (!blocksToday.length || blocksToday[0].startDate.getDate() !== now.getDate()) {
      blocksToday = buildTodayBlocks(scheduleRaw, now);
    }

    const curIdx = findCurrentIndex(blocksToday, now);

    if (curIdx === -1) {
      const nextIdx = findNextIndex(blocksToday, now);

      if (nextIdx === 0) {
        // Before the first block of the day — check the pre-start countdown window.
        const first = blocksToday[0];
        const preStartMs = (scheduleRaw.preStartMinutes || 0) * 60 * 1000;
        const windowStart = new Date(first.startDate.getTime() - preStartMs);

        if (preStartMs > 0 && now >= windowStart) {
          const total = first.startDate - windowStart;
          const elapsed = now - windowStart;
          const remaining = first.startDate - now;
          const frac = Math.min(1, Math.max(0, elapsed / total));

          els.blockLabel.textContent = "Before School";
          els.countdown.textContent = fmtCountdown(remaining);
          els.subLabel.textContent = "until day starts";
          els.ringProgress.setAttribute("class", "ring-progress transition");
          els.ringProgress.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - frac);
          els.nextUp.innerHTML = `Next: <b>${first.label}</b> at ${fmtClock(first.startDate)}`;

          registerState("prestart", now, false);
          return;
        }

        renderIdle(`Day starts at ${fmtClock(first.startDate)}`);
        registerState("idle-before", now, false);
        return;
      }

      if (nextIdx === -1) {
        renderIdle("School day complete");
        // Chime-worthy: this is the moment the last block of the day just ended.
        registerState("idle-after", now, true);
      } else {
        const next = blocksToday[nextIdx];
        renderIdle(`Day starts at ${fmtClock(next.startDate)}`);
        registerState("idle-before", now, false);
      }
      return;
    }

    const block = blocksToday[curIdx];

    const total = block.endDate - block.startDate;
    const elapsed = now - block.startDate;
    const remaining = block.endDate - now;
    const frac = Math.min(1, Math.max(0, elapsed / total));

    els.blockLabel.textContent = block.label;
    els.countdown.textContent = fmtCountdown(remaining);
    els.subLabel.textContent = block.type === "transition" ? "until next class" : "remaining";

    els.ringProgress.setAttribute(
      "class",
      `ring-progress ${colorClassFor(block.type)}`
    );
    els.ringProgress.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - frac);

    const nextIdx = curIdx + 1;
    if (nextIdx < blocksToday.length) {
      const nb = blocksToday[nextIdx];
      els.nextUp.innerHTML = `Next: <b>${nb.label}</b> at ${fmtClock(nb.startDate)}`;
    } else {
      els.nextUp.textContent = "Last block of the day";
    }

    // Chime-worthy: entering any real class/transition/lunch block.
    registerState(`block::${curIdx}`, now, true);
  }

  // Detects a boundary crossing into a new state and fires the chime only when
  // that specific crossing is chime-worthy (chimeworthy=true) — i.e. the start
  // of a real block, or the end of the school day. Entering an idle state
  // (weekend, before school, the pre-start countdown window) never chimes.
  // The very first tick after page load never chimes either, so the bell
  // doesn't fire just because the page happened to load mid-period.
  function registerState(rawKey, now, chimeworthy) {
    const key = `${now.toDateString()}::${rawKey}`;
    if (hasTicked && chimeworthy && lastStateKey !== key) {
      playChime();
    }
    lastStateKey = key;
    hasTicked = true;
  }

  function renderIdle(message) {
    els.blockLabel.textContent = message;
    els.countdown.textContent = "--:--";
    els.subLabel.textContent = "\u00A0";
    els.nextUp.textContent = "\u00A0";
    els.ringProgress.setAttribute("class", "ring-progress idle");
    els.ringProgress.style.strokeDashoffset = 0;
  }

  // ---------- Schedule panel ----------
  function renderPanel() {
    const now = new Date();
    const curIdx = blocksToday.length ? findCurrentIndex(blocksToday, now) : -1;
    els.scheduleList.innerHTML = "";
    blocksToday.forEach((b, i) => {
      const li = document.createElement("li");
      if (i === curIdx) li.className = "current";
      li.innerHTML = `<span>${b.label}</span><span>${fmtClock(b.startDate)}\u2013${fmtClock(b.endDate)}</span>`;
      els.scheduleList.appendChild(li);
    });
  }

  // ---------- Data loading ----------
  async function loadSchedule() {
    const res = await fetch("schedule.json", { cache: "no-store" });
    scheduleRaw = await res.json();
    blocksToday = buildTodayBlocks(scheduleRaw, new Date());
  }

  async function refreshScheduleQuietly() {
    try {
      const res = await fetch("schedule.json", { cache: "no-store" });
      const fresh = await res.json();
      scheduleRaw = fresh;
      blocksToday = buildTodayBlocks(scheduleRaw, new Date());
    } catch (e) {
      // Offline or fetch failed — keep using the last known schedule.
    }
  }

  // ---------- Wire up ----------
  els.unlockBtn.addEventListener("click", () => {
    unlockAudio();
    els.overlay.classList.add("hidden");
    els.app.classList.remove("hidden");
  });
  els.silentBtn.addEventListener("click", () => {
    soundEnabled = false;
    els.overlay.classList.add("hidden");
    els.app.classList.remove("hidden");
  });
  els.editToggle.addEventListener("click", () => {
    renderPanel();
    els.schedulePanel.classList.remove("hidden");
  });
  els.closePanel.addEventListener("click", () => {
    els.schedulePanel.classList.add("hidden");
  });

  (async function init() {
    await loadSchedule();
    tick();
    setInterval(tick, 1000);
    setInterval(refreshScheduleQuietly, 5 * 60 * 1000); // pick up schedule.json edits every 5 min

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    }
  })();
})();
