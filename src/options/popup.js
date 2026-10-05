// popup.js — the settings dialog.
// Reads/writes chrome.storage.local; the content script picks up changes via
// chrome.storage.onChanged and relays them into the page world.

const KEY = "cb_tally_v1";
const fmt = (n) => n >= 10000 ? (n / 1000).toFixed(1) + "k" : String(n);

const refresh = async () => {
  const o = await chrome.storage.local.get([
    KEY, "characterEnabled", "runnerEnabled", "characterEngine", "live2dModel"
  ]);
  const t = o[KEY] || { totalChars: 0, totalRequests: 0, totalErrors: 0 };
  document.getElementById("total").textContent = fmt(Math.round((t.totalChars || 0) / 4));
  document.getElementById("reqs").textContent  = fmt(t.totalRequests || 0);
  document.getElementById("errs").textContent  = fmt(t.totalErrors || 0);
  document.getElementById("chr").checked = o.characterEnabled !== false;
  document.getElementById("run").checked = o.runnerEnabled   !== false;

  const engine = o.characterEngine || "svg";
  document.getElementById("eng").value = engine;
  document.getElementById("model").value = o.live2dModel || "Hiyori/Hiyori.model3.json";
  document.querySelectorAll(".l2d-only").forEach(el =>
    el.classList.toggle("on", engine === "live2d")
  );
};

document.getElementById("chr").addEventListener("change", (e) => {
  chrome.storage.local.set({ characterEnabled: e.target.checked });
});
document.getElementById("run").addEventListener("change", (e) => {
  chrome.storage.local.set({ runnerEnabled: e.target.checked });
});
document.getElementById("eng").addEventListener("change", (e) => {
  chrome.storage.local.set({ characterEngine: e.target.value });
  document.querySelectorAll(".l2d-only").forEach(el =>
    el.classList.toggle("on", e.target.value === "live2d")
  );
});
document.getElementById("model").addEventListener("change", (e) => {
  chrome.storage.local.set({ live2dModel: e.target.value.trim() });
});
document.getElementById("reset").addEventListener("click", async () => {
  await chrome.storage.local.set({ [KEY]: { totalChars: 0, totalRequests: 0, totalErrors: 0, sessionStart: Date.now() } });
  refresh();
});

refresh();
