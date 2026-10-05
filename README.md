# 🔥 Claude Burn

A Chrome extension that augments **claude.ai** with:

- A **Google-Colab-style runner bar** that shows elapsed time, token count,
  tokens/sec, and a shimmer that pulses with every streaming delta.
- A **floating anime character** that reacts to Claude as it thinks —
  idle breathing, perks up when a response starts, lights a flame while
  tokens stream, tilts when a tool is used, bobs happily when done.
- A quiet **session-total ticker** in the corner (how much Claude you've
  burned today).

Zero API keys. Zero accounts. The user stays logged into claude.ai normally —
Claude Burn only *watches* the SSE stream Anthropic sends back and drives
UI from it. Nothing leaves the browser.

---

## Install (dev)

1. Clone this repo.
2. Open `chrome://extensions`.
3. Toggle **Developer mode** (top right).
4. Click **Load unpacked** → pick the `claude-burn/` folder.
5. Go to <https://claude.ai> and start a chat. The runner bar appears at
   the bottom; the character sits at the right.

Open the extension's popup (toolbar icon) to toggle the character or
runner, or to reset session stats.

## How it works

Three pieces, laid out in `src/`:

```
src/
├── content/bridge.js       — isolated-world script. Injects the next two
│                             into the page world, and relays settings &
│                             stream events between page ↔ chrome.storage ↔ SW.
├── injected/fetch-tap.js   — page-world script. Monkey-patches window.fetch
│                             BEFORE claude.ai's bundle grabs a reference.
│                             For every text/event-stream response under
│                             /completion, calls response.body.tee() to split
│                             the stream — one copy flows to claude.ai
│                             untouched, the other is parsed into SSE frames
│                             and emitted as postMessage events.
├── overlay/overlay.js      — page-world script. Builds a shadow-DOM overlay
│                             (so claude.ai's Tailwind can't fight ours),
│                             renders the runner bar and character, drives
│                             their state from the stream events.
└── background/sw.js        — MV3 service worker. Aggregates lifetime burn
                              totals in chrome.storage.local and broadcasts
                              them back to open claude.ai tabs.
```

### The core trick

Content scripts can't touch claude.ai's JS objects. So the fetch wrapper has
to run in the **page world**, via an injected `<script>` tag. Once wrapped,
every streaming response gets `response.body.tee()`d — one copy to the app,
one copy to us. We never alter a byte claude.ai receives; we just read a
parallel copy.

```js
// fetch-tap.js (page world)
const [toApp, toUs] = res.body.tee();
consumeSSE(toUs, (evt) => emit("stream-event", evt));
return new Response(toApp, { status: res.status, headers: res.headers });
```

That gives us:

- `stream_open` — flip character to **start** mood, show runner
- `content_block_delta` with text — advance char counter, pulse flame
- `content_block_start { type: "tool_use" }` — flip to **tool** mood (yellow)
- `message_stop` → `stream_close` — flip to **done**, bob animation, hide shimmer
- `stream_error` → red dot, shake

### Why shadow DOM

claude.ai ships Tailwind. We ship our own styles. Shadow DOM is the only
sane way to keep them from fighting. The overlay mounts ONE host `<div>`
on `<html>` and does everything inside its shadow root.

### Why not use their session token?

Scraping claude.ai cookies to replay API calls is against Anthropic's
Usage Policy and will get accounts banned. This extension never does
that — it only observes streams the user themselves initiated.

## Roadmap

- [ ] Live2D rig for the character (currently inline SVG with CSS keyframes)
- [ ] Prompt library (slash commands injected into the composer)
- [ ] Export conversation to Markdown
- [ ] Keyboard shortcuts (`⌘/Ctrl+K` command palette)
- [ ] Theme packs (cyberpunk, pastel, hacker-green)
- [ ] Accurate token counts (bundle `@anthropic-ai/tokenizer`)
- [ ] Per-model cost estimation
- [ ] Daily / weekly burn charts in the popup

## License

MIT — do whatever you want with this, just don't claim it as official
Anthropic software.

---

Co-Authored-By: Claude Opus 4.7
