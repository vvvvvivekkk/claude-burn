// bridge.js — runs in the isolated content-script world on claude.ai
// Job: (1) inject fetch-tap.js into the page world so we can wrap window.fetch
//      (2) inject overlay.js (the UI) into the page as well
//      (3) relay events between the page world and the extension (storage, SW)
//
// The isolated-world content script cannot touch claude.ai's own JS objects,
// so the real stream interception has to happen in the page world. We talk to
// the page world via window.postMessage (same tab, same origin — this is safe
// as long as we check event.source === window and tag our messages).

(() => {
  const TAG = "[claude-burn]";

  // --- 1. inject page-world scripts ------------------------------------------
  const injectScript = (file) => {
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL(file);
    s.async = false;              // keep execution order deterministic
    s.dataset.claudeBurn = "1";
    (document.head || document.documentElement).appendChild(s);
    // remove the tag once loaded — the code is in memory, the <script> is noise
    s.onload = () => s.remove();
  };

  // fetch-tap first — it needs to wrap window.fetch before claude.ai's app
  // code caches a reference to it. overlay.js can come right after.
  injectScript("src/injected/fetch-tap.js");

  // Live2D vendor libs — load *before* overlay.js so that by the time the
  // overlay asks for the engine, PIXI / PIXI.live2d / Live2DCubismCore are
  // already globals on window. We only inject them if the user turned Live2D
  // on; otherwise the SVG engine is used and the extra ~570 KB is skipped.
  //
  // Each file is loaded via web_accessible_resources, so the page world's
  // CSP is fine with it (chrome-extension:// origin is trusted by MV3).
  chrome.storage.local.get(["characterEngine"], (o) => {
    if (o.characterEngine === "live2d") {
      // Order matters: live2dcubismcore must exist before pixi-live2d-display
      // tries to register the Cubism 4 model factory.
      injectScript("vendor/live2dcubismcore.min.js");
      injectScript("vendor/pixi.min.js");
      injectScript("vendor/pixi-live2d-display-cubism4.min.js");
    }
    injectScript("src/overlay/overlay.js");
  });

  // --- 2. relay settings from chrome.storage into the page world -------------
  // The page world has no access to chrome.*, so the content script is the
  // one that reads/writes settings and pushes updates in.
  const broadcastSettings = (settings) => {
    window.postMessage({ __cb: true, type: "settings", settings }, "*");
  };

  chrome.storage.local.get(null, (settings) => broadcastSettings(settings || {}));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    chrome.storage.local.get(null, (settings) => broadcastSettings(settings || {}));
  });

  // --- 3. relay events from the page world out to the service worker --------
  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const data = ev.data;
    if (!data || data.__cb !== true) return;

    // page world asked us to persist a setting
    if (data.type === "set-setting" && data.key) {
      chrome.storage.local.set({ [data.key]: data.value });
      return;
    }

    // stream events — forward to SW so it can aggregate cost/token totals,
    // and the SW can echo back a running tally that we re-post into the page
    if (data.type === "stream-event") {
      try {
        chrome.runtime.sendMessage({ kind: "stream-event", event: data.event });
      } catch { /* SW asleep; harmless */ }
    }
  });

  // tally updates from SW come back the other way
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.kind !== "tally") return;
    window.postMessage({ __cb: true, type: "tally", tally: msg.tally }, "*");
  });

  console.log(`${TAG} bridge loaded`);
})();
