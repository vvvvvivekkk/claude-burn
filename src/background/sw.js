// sw.js — MV3 service worker.
// Aggregates per-session + lifetime burn totals and broadcasts them back
// to any claude.ai tab that's listening. Lives behind chrome.storage.local
// so numbers survive SW restarts.
//
// Note: MV3 workers die after ~30s idle. All state goes through storage.

const KEY = "cb_tally_v1";

const emptyTally = () => ({
  totalChars: 0,
  totalRequests: 0,
  totalErrors: 0,
  sessionStart: Date.now(),
});

const getTally = async () => {
  const o = await chrome.storage.local.get(KEY);
  return o[KEY] || emptyTally();
};
const setTally = (t) => chrome.storage.local.set({ [KEY]: t });

const broadcast = (tally) => {
  chrome.tabs.query({ url: "https://claude.ai/*" }, (tabs) => {
    for (const tab of tabs) {
      try { chrome.tabs.sendMessage(tab.id, { kind: "tally", tally }); } catch {}
    }
  });
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.kind !== "stream-event") return;
  const ev = msg.event || {};
  (async () => {
    const t = await getTally();
    if (ev.event === "stream_open")   t.totalRequests += 1;
    if (ev.event === "stream_error")  t.totalErrors += 1;
    if (ev.event === "stream_close")  { t.totalChars += (ev.charCount || 0); }
    await setTally(t);
    broadcast(t);
  })();
  // we don't need to answer the content script
  return false;
});

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(KEY);
  if (!existing[KEY]) await setTally(emptyTally());
});
