// overlay.js — runs in the page world. Builds a shadow-DOM overlay with:
//   1. Colab-style runner bar at the bottom (elapsed, tokens, tok/s, shimmer)
//   2. Floating character on the right side that reacts to stream events
//
// We own ONE host <div> on <body>, attach a shadow root, and never leak styles.
// All data comes from window.postMessage events of {__cb: true, type: 'stream-event' | 'tally' | 'settings'}.

(() => {
  if (window.__claudeBurnOverlay) return;
  window.__claudeBurnOverlay = true;

  // ---- state ---------------------------------------------------------------
  const state = {
    streaming: false,
    startedAt: 0,
    chars: 0,
    deltas: 0,
    tokensPerSec: 0,
    lastDeltaAt: 0,
    lastCharCount: 0,
    model: "",
    settings: { characterEnabled: true, runnerEnabled: true, side: "right" },
    tally: { totalChars: 0, totalRequests: 0, sessionStart: Date.now() },
    mood: "idle", // idle | start | burn | tool | done | error
  };

  // ---- shadow root ---------------------------------------------------------
  const mount = () => {
    if (document.getElementById("claude-burn-host")) return;
    const host = document.createElement("div");
    host.id = "claude-burn-host";
    host.style.cssText =
      "all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483646;";
    document.documentElement.appendChild(host);
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = TEMPLATE;
    wire(root);
    tickLoop();
  };

  // run as soon as body is there — on claude.ai that's instant after DCL
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });

  // ---- template ------------------------------------------------------------
  const TEMPLATE = /* html */ `
  <style>
    :host, * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }

    /* ===== Runner bar ===== */
    .runner {
      position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%);
      min-width: 320px; max-width: 560px;
      display: flex; align-items: center; gap: 10px;
      padding: 8px 14px;
      background: rgba(18,18,22,0.78);
      backdrop-filter: blur(14px) saturate(140%);
      -webkit-backdrop-filter: blur(14px) saturate(140%);
      color: #f3f3f6;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow: 0 8px 32px rgba(0,0,0,0.35), 0 2px 6px rgba(0,0,0,0.2);
      pointer-events: auto;
      opacity: 0; transform: translate(-50%, 24px);
      transition: opacity .35s ease, transform .35s cubic-bezier(.2,.9,.3,1.2);
      font-size: 12px; line-height: 1;
    }
    .runner.visible { opacity: 1; transform: translate(-50%, 0); }

    .runner .dot {
      width: 10px; height: 10px; border-radius: 50%;
      background: radial-gradient(circle at 30% 30%, #fff, #ff7a3d 60%, #c22a00 100%);
      box-shadow: 0 0 10px #ff7a3d, 0 0 24px rgba(255,122,61,0.55);
      animation: pulse 1.2s ease-in-out infinite;
    }
    .runner.idle .dot { animation-duration: 2.4s; opacity: .55; }
    .runner.error .dot {
      background: radial-gradient(circle at 30% 30%, #fff, #ff3d55 60%, #8a0014 100%);
      box-shadow: 0 0 10px #ff3d55, 0 0 24px rgba(255,61,85,0.55);
    }
    .runner.tool .dot {
      background: radial-gradient(circle at 30% 30%, #fff, #ffd23d 60%, #a56a00 100%);
      box-shadow: 0 0 10px #ffd23d, 0 0 24px rgba(255,210,61,0.55);
    }
    .runner.done .dot {
      background: radial-gradient(circle at 30% 30%, #fff, #3dff8a 60%, #006b2a 100%);
      box-shadow: 0 0 10px #3dff8a, 0 0 24px rgba(61,255,138,0.55);
      animation: none;
    }

    .meta { display: flex; align-items: center; gap: 10px; font-variant-numeric: tabular-nums; }
    .meta b { font-weight: 600; color: #fff; }
    .meta .label { opacity: .55; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; }
    .sep { width: 1px; height: 14px; background: rgba(255,255,255,0.12); }

    .shimmer {
      position: relative; height: 3px; width: 110px; border-radius: 2px;
      background: rgba(255,255,255,0.08); overflow: hidden;
    }
    .shimmer::after {
      content: ""; position: absolute; inset: 0; width: 40%;
      background: linear-gradient(90deg, transparent, rgba(255,122,61,0.9), transparent);
      animation: slide 1.2s linear infinite;
    }
    .runner.idle .shimmer::after,
    .runner.done .shimmer::after { animation: none; opacity: 0; }

    @keyframes pulse { 0%,100%{transform:scale(1);} 50%{transform:scale(1.25);} }
    @keyframes slide { 0%{transform:translateX(-100%);} 100%{transform:translateX(275%);} }

    /* ===== Character ===== */
    .char {
      position: fixed; right: 24px; bottom: 110px;
      width: 160px; height: 180px;
      pointer-events: auto; cursor: grab;
      user-select: none;
      transform-origin: 50% 90%;
      animation: breathe 3.6s ease-in-out infinite;
    }
    .char.hidden { display: none; }
    .char svg { width: 100%; height: 100%; display: block; }

    /* mood-driven motion layered on top of breathe */
    .char.mood-start { animation: perk .5s cubic-bezier(.25,1.4,.4,1) 1, breathe 3.2s ease-in-out infinite .5s; }
    .char.mood-burn  { animation: burn 0.9s ease-in-out infinite; }
    .char.mood-tool  { animation: tilt 1.4s ease-in-out infinite; }
    .char.mood-done  { animation: bob 1.1s ease-out 1, breathe 4s ease-in-out infinite 1.1s; }

    @keyframes breathe { 0%,100%{transform:scaleY(1) scaleX(1);} 50%{transform:scaleY(1.015) scaleX(.992);} }
    @keyframes perk    { 0%{transform:translateY(0) scale(1);} 60%{transform:translateY(-8px) scale(1.04);} 100%{transform:translateY(0) scale(1);} }
    @keyframes burn    { 0%,100%{transform:translateY(0) rotate(-1deg);} 50%{transform:translateY(-2px) rotate(1deg);} }
    @keyframes tilt    { 0%,100%{transform:rotate(-6deg);} 50%{transform:rotate(6deg);} }
    @keyframes bob     { 0%{transform:translateY(0);} 40%{transform:translateY(-10px);} 100%{transform:translateY(0);} }

    /* Flame — overlaid on the character's hand */
    .flame {
      position: absolute; left: 10px; bottom: 46px;
      width: 36px; height: 56px; opacity: 0; transition: opacity .25s;
      pointer-events: none;
      transform-origin: 50% 100%;
    }
    .char.mood-burn .flame, .char.mood-tool .flame { opacity: 1; }
    .flame-inner { width: 100%; height: 100%; animation: flicker .18s ease-in-out infinite alternate; }
    @keyframes flicker { from{transform:scaleY(1) scaleX(1);} to{transform:scaleY(1.1) scaleX(.9);} }

    /* Token counter floating above character */
    .burn-meter {
      position: absolute; top: -6px; left: 50%; transform: translateX(-50%);
      padding: 3px 8px; border-radius: 999px;
      font-size: 10px; font-variant-numeric: tabular-nums;
      background: rgba(0,0,0,0.72); color: #ffd23d;
      border: 1px solid rgba(255,210,61,0.3);
      white-space: nowrap;
      opacity: 0; transition: opacity .2s;
    }
    .char.mood-burn .burn-meter, .char.mood-tool .burn-meter { opacity: 1; }

    /* Session total — a tiny ambient ticker in the corner */
    .ticker {
      position: fixed; right: 16px; top: 16px;
      padding: 6px 10px; border-radius: 999px;
      background: rgba(18,18,22,0.65);
      color: rgba(255,255,255,0.72); font-size: 11px;
      border: 1px solid rgba(255,255,255,0.06);
      pointer-events: auto; cursor: default;
      font-variant-numeric: tabular-nums;
      backdrop-filter: blur(10px);
    }
    .ticker b { color: #ff9f6b; font-weight: 600; }
  </style>

  <div class="runner idle" part="runner">
    <div class="dot"></div>
    <div class="meta">
      <span><span class="label">t</span> <b class="elapsed">0.0s</b></span>
      <div class="sep"></div>
      <span><span class="label">tok</span> <b class="tokens">0</b></span>
      <div class="sep"></div>
      <span><span class="label">tok/s</span> <b class="tps">0</b></span>
    </div>
    <div class="shimmer"></div>
  </div>

  <div class="ticker"><b class="total">0</b> tokens burned this session</div>

  <div class="char" part="char">
    <!-- Simple vector character — swap for sprite/Lottie later -->
    <svg viewBox="0 0 160 180" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="hair" cx="50%" cy="30%" r="60%">
          <stop offset="0" stop-color="#ffb260"/>
          <stop offset="1" stop-color="#c7560f"/>
        </radialGradient>
        <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2b2140"/>
          <stop offset="1" stop-color="#140a24"/>
        </linearGradient>
      </defs>
      <!-- body / cloak -->
      <path d="M30 170 Q30 110 55 90 L105 90 Q130 110 130 170 Z" fill="url(#body)"/>
      <!-- arms -->
      <path d="M55 110 Q35 125 32 150" stroke="#1a1130" stroke-width="10" fill="none" stroke-linecap="round"/>
      <path d="M105 110 Q125 125 128 150" stroke="#1a1130" stroke-width="10" fill="none" stroke-linecap="round"/>
      <!-- head -->
      <circle cx="80" cy="62" r="34" fill="#fbe3c6"/>
      <!-- hair -->
      <path d="M46 55 Q50 20 80 20 Q110 20 114 55 Q110 42 95 40 Q90 32 80 32 Q70 32 65 40 Q50 42 46 55 Z" fill="url(#hair)"/>
      <!-- eyes -->
      <g class="eyes">
        <ellipse class="eye-l" cx="68" cy="66" rx="3.6" ry="5"/>
        <ellipse class="eye-r" cx="92" cy="66" rx="3.6" ry="5"/>
      </g>
      <!-- mouth -->
      <path class="mouth" d="M72 80 Q80 86 88 80" stroke="#5a2a12" stroke-width="2" fill="none" stroke-linecap="round"/>
    </svg>
    <div class="flame">
      <svg class="flame-inner" viewBox="0 0 36 56" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="fl" cx="50%" cy="80%" r="70%">
            <stop offset="0" stop-color="#fff6c0"/>
            <stop offset=".4" stop-color="#ffb84a"/>
            <stop offset=".8" stop-color="#ff4a1a"/>
            <stop offset="1" stop-color="rgba(255,74,26,0)"/>
          </radialGradient>
        </defs>
        <path d="M18 2 Q6 20 10 36 Q12 50 18 54 Q24 50 26 36 Q30 20 18 2 Z" fill="url(#fl)"/>
      </svg>
    </div>
    <div class="burn-meter"><span class="bm-tps">0</span> tok/s · <span class="bm-chars">0</span></div>
  </div>
  `;

  // ---- wiring --------------------------------------------------------------
  let runnerEl, dotEl, elapsedEl, tokensEl, tpsEl, charEl, totalEl, bmTpsEl, bmCharsEl;

  const wire = (root) => {
    runnerEl  = root.querySelector(".runner");
    elapsedEl = root.querySelector(".elapsed");
    tokensEl  = root.querySelector(".tokens");
    tpsEl     = root.querySelector(".tps");
    charEl    = root.querySelector(".char");
    totalEl   = root.querySelector(".total");
    bmTpsEl   = root.querySelector(".bm-tps");
    bmCharsEl = root.querySelector(".bm-chars");

    // dragging — simple pointer drag for the character
    let dragging = false, dx = 0, dy = 0;
    charEl.addEventListener("pointerdown", (e) => {
      dragging = true; dx = e.clientX - charEl.offsetLeft; dy = e.clientY - charEl.offsetTop;
      charEl.setPointerCapture(e.pointerId); charEl.style.cursor = "grabbing";
    });
    charEl.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const x = e.clientX - dx, y = e.clientY - dy;
      charEl.style.left = x + "px"; charEl.style.top = y + "px";
      charEl.style.right = "auto"; charEl.style.bottom = "auto";
    });
    charEl.addEventListener("pointerup", (e) => {
      dragging = false; charEl.style.cursor = "grab";
      // persist last position in storage via the bridge
      window.postMessage({ __cb: true, type: "set-setting", key: "charPos",
        value: { left: charEl.style.left, top: charEl.style.top } }, "*");
    });
  };

  const setMood = (mood) => {
    state.mood = mood;
    if (!charEl) return;
    charEl.className = "char mood-" + mood;
    if (!state.settings.characterEnabled) charEl.classList.add("hidden");
    runnerEl.className = "runner " + (mood === "idle" ? "idle"
      : mood === "done" ? "done"
      : mood === "error" ? "error"
      : mood === "tool" ? "tool" : "");
    runnerEl.classList.toggle("visible", mood !== "idle" || state.streaming);
  };

  // ---- event intake --------------------------------------------------------
  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const d = ev.data; if (!d || d.__cb !== true) return;

    if (d.type === "settings") {
      state.settings = Object.assign(state.settings, d.settings || {});
      if (charEl) charEl.classList.toggle("hidden", !state.settings.characterEnabled);
      if (state.settings.charPos && charEl) {
        charEl.style.left = state.settings.charPos.left || "";
        charEl.style.top  = state.settings.charPos.top  || "";
        if (state.settings.charPos.left) { charEl.style.right = "auto"; charEl.style.bottom = "auto"; }
      }
    }

    if (d.type === "tally") {
      state.tally = d.tally;
      totalEl && (totalEl.textContent = fmt(Math.round(state.tally.totalChars / 4)));
    }

    if (d.type === "stream-event") handleStream(d.event);
  });

  const handleStream = (e) => {
    const name = e.event;
    if (name === "stream_open") {
      state.streaming = true;
      state.startedAt = performance.now();
      state.chars = 0; state.deltas = 0; state.lastCharCount = 0; state.lastDeltaAt = state.startedAt;
      setMood("start");
      // after a moment, flip into burn mode (first delta usually arrives fast)
      setTimeout(() => { if (state.streaming) setMood("burn"); }, 350);
      return;
    }
    if (name === "stream_close") {
      state.streaming = false;
      setMood("done");
      // after 2.5s, go back to idle
      setTimeout(() => { if (!state.streaming) setMood("idle"); }, 2500);
      return;
    }
    if (name === "stream_error") {
      state.streaming = false;
      setMood("error");
      setTimeout(() => { if (!state.streaming) setMood("idle"); }, 3500);
      return;
    }

    // mid-stream events
    const d = e.data || {};
    // Anthropic SSE emits: message_start, content_block_start, content_block_delta,
    // content_block_stop, message_delta, message_stop, ping. Tool use shows up as
    // content_block_start with a `tool_use` block.
    if (d && d.type === "content_block_start" && d.content_block && d.content_block.type === "tool_use") {
      setMood("tool");
    } else if (d && d.type === "content_block_stop" && state.mood === "tool") {
      setMood("burn");
    }

    // deltas carry text — our tap already counts chars in e.charCount
    if (typeof e.charCount === "number") state.chars = e.charCount;
    if (typeof e.deltas === "number") state.deltas = e.deltas;
  };

  // ---- 60fps-ish render loop (requestAnimationFrame, throttled) ------------
  let lastRender = 0;
  const RENDER_HZ = 15; // 15 updates/sec is plenty for text numbers
  const tickLoop = () => {
    const now = performance.now();
    if (now - lastRender >= 1000 / RENDER_HZ) {
      lastRender = now;
      render(now);
    }
    requestAnimationFrame(tickLoop);
  };

  const render = (now) => {
    if (!elapsedEl) return;
    if (state.streaming) {
      const elapsed = (now - state.startedAt) / 1000;
      // rough tok estimate: chars/4
      const tokEst = Math.round(state.chars / 4);
      const tps = elapsed > 0 ? Math.round(tokEst / elapsed) : 0;
      elapsedEl.textContent = elapsed.toFixed(1) + "s";
      tokensEl.textContent  = fmt(tokEst);
      tpsEl.textContent     = String(tps);
      if (bmTpsEl)   bmTpsEl.textContent   = String(tps);
      if (bmCharsEl) bmCharsEl.textContent = fmt(state.chars) + " ch";
    }
  };

  const fmt = (n) => n >= 10000 ? (n / 1000).toFixed(1) + "k" : String(n);

  console.log("[claude-burn] overlay mounted");
})();
