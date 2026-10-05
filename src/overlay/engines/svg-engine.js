// svg-engine.js — the inline-SVG character engine. Zero assets required.
// This is what you see by default when the extension is first installed.
//
// The engine owns a <div class="char"> element with an SVG inside. Moods are
// implemented as CSS class swaps on the host div, so animations are pure
// CSS keyframes defined in the parent stylesheet (see overlay.js TEMPLATE).

export const create = (settings) => {
  let hostEl = null;
  let charEl = null;
  let bmTpsEl = null;
  let bmCharsEl = null;

  const SVG = /* html */ `
    <svg viewBox="0 0 160 180" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="hair-${rand()}" cx="50%" cy="30%" r="60%">
          <stop offset="0" stop-color="#ffb260"/>
          <stop offset="1" stop-color="#c7560f"/>
        </radialGradient>
        <linearGradient id="body-${rand()}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2b2140"/>
          <stop offset="1" stop-color="#140a24"/>
        </linearGradient>
      </defs>
      <path d="M30 170 Q30 110 55 90 L105 90 Q130 110 130 170 Z" fill="currentColor" style="color:#1b1130"/>
      <path d="M55 110 Q35 125 32 150" stroke="#1a1130" stroke-width="10" fill="none" stroke-linecap="round"/>
      <path d="M105 110 Q125 125 128 150" stroke="#1a1130" stroke-width="10" fill="none" stroke-linecap="round"/>
      <circle cx="80" cy="62" r="34" fill="#fbe3c6"/>
      <path d="M46 55 Q50 20 80 20 Q110 20 114 55 Q110 42 95 40 Q90 32 80 32 Q70 32 65 40 Q50 42 46 55 Z"
            fill="#d97a2a"/>
      <ellipse class="eye-l" cx="68" cy="66" rx="3.6" ry="5"/>
      <ellipse class="eye-r" cx="92" cy="66" rx="3.6" ry="5"/>
      <path class="mouth" d="M72 80 Q80 86 88 80" stroke="#5a2a12" stroke-width="2" fill="none" stroke-linecap="round"/>
    </svg>
    <div class="flame">
      <svg class="flame-inner" viewBox="0 0 36 56" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="fl-${rand()}" cx="50%" cy="80%" r="70%">
            <stop offset="0" stop-color="#fff6c0"/>
            <stop offset=".4" stop-color="#ffb84a"/>
            <stop offset=".8" stop-color="#ff4a1a"/>
            <stop offset="1" stop-color="rgba(255,74,26,0)"/>
          </radialGradient>
        </defs>
        <path d="M18 2 Q6 20 10 36 Q12 50 18 54 Q24 50 26 36 Q30 20 18 2 Z"
              fill="url(#fl-${rand()})"/>
      </svg>
    </div>
    <div class="burn-meter"><span class="bm-tps">0</span> tok/s · <span class="bm-chars">0</span></div>
  `;

  return {
    kind: "svg",

    mount(host) {
      hostEl = host;
      charEl = document.createElement("div");
      charEl.className = "char mood-idle";
      charEl.innerHTML = SVG;
      hostEl.appendChild(charEl);
      bmTpsEl   = charEl.querySelector(".bm-tps");
      bmCharsEl = charEl.querySelector(".bm-chars");
      return charEl;
    },

    setMood(mood) {
      if (!charEl) return;
      charEl.className = "char mood-" + mood;
    },

    onDelta({ tps, chars }) {
      if (bmTpsEl)   bmTpsEl.textContent   = String(tps | 0);
      if (bmCharsEl) bmCharsEl.textContent = fmt(chars) + " ch";
    },

    destroy() {
      charEl?.remove();
      charEl = null;
    },
  };
};

const rand = () => Math.random().toString(36).slice(2, 8);
const fmt  = (n) => n >= 10000 ? (n / 1000).toFixed(1) + "k" : String(n);
