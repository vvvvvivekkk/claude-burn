// fetch-tap.js — runs in the page world on claude.ai.
// Wraps window.fetch so we can see claude.ai's streaming completions as they
// happen, without changing a single byte the host app receives.
//
// Strategy:
//   1. Monkey-patch window.fetch BEFORE claude.ai's bundle captures a ref.
//   2. For every response whose body is an SSE stream (text/event-stream),
//      we call response.body.tee() to split it in two: one copy flows on to
//      claude.ai untouched, the other we read in our own loop.
//   3. Parse SSE frames generically and emit {type, raw, data} events through
//      window.postMessage so our content script (bridge.js) can forward them.
//
// Why postMessage instead of CustomEvent? Both work; postMessage is easier to
// filter by event.source === window and matches the pattern bridge.js uses.

(() => {
  if (window.__claudeBurnFetchTap) return;
  window.__claudeBurnFetchTap = true;

  const emit = (type, event) => {
    window.postMessage({ __cb: true, type, event }, window.location.origin);
  };

  // --- URL filter -----------------------------------------------------------
  // Claude.ai's streaming completion endpoint lives under /api/organizations/.../chat_conversations/.../completion
  // and sometimes under /completion. We also want to catch retry/append endpoints.
  // Keep this permissive: we only *tap* streams, we don't block anything.
  const looksLikeChatStream = (url) => {
    try {
      const u = new URL(url, window.location.origin);
      const p = u.pathname;
      return (
        p.includes("/completion") ||
        p.includes("/retry_completion") ||
        p.includes("/chat_conversations/") && (p.endsWith("/completion") || p.includes("/completion?"))
      );
    } catch { return false; }
  };

  // --- SSE parser -----------------------------------------------------------
  // Reads a ReadableStream<Uint8Array>, splits on \n\n frame boundaries, and
  // calls onEvent({event, data}) for each parsed SSE frame.
  const consumeSSE = async (stream, onEvent, onDone, onError) => {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          if (!frame.trim()) continue;

          let evName = "message";
          const dataLines = [];
          for (const line of frame.split("\n")) {
            if (line.startsWith("event:")) evName = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
          }
          const dataStr = dataLines.join("\n");
          let data = dataStr;
          try { data = JSON.parse(dataStr); } catch { /* keep as string */ }
          onEvent({ event: evName, data });
        }
      }
      onDone?.();
    } catch (err) {
      onError?.(err);
    }
  };

  // --- fetch wrapper --------------------------------------------------------
  const origFetch = window.fetch.bind(window);
  window.fetch = async function patchedFetch(input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    const method = (init && init.method) || (input && input.method) || "GET";

    // Grab the request body text if the caller passed one — useful for logging
    // model name & input token estimates without any PII leaving the page.
    let reqMeta = null;
    try {
      if (init && typeof init.body === "string" && init.body.length < 200_000) {
        reqMeta = init.body;
      }
    } catch { /* ignore */ }

    const res = await origFetch(input, init);

    // Only tap chat-completion streams
    if (!looksLikeChatStream(url)) return res;

    const ct = res.headers.get("content-type") || "";
    if (!res.body || !ct.includes("text/event-stream")) return res;

    // Split the stream — one copy to the app, one copy to us
    const [toApp, toUs] = res.body.tee();

    const startedAt = performance.now();
    let charCount = 0;
    let deltas = 0;
    emit("stream-event", {
      event: "stream_open",
      startedAt,
      url: url.replace(/\?.*$/, ""),
      method,
      reqMetaLen: reqMeta ? reqMeta.length : 0,
    });

    consumeSSE(
      toUs,
      ({ event, data }) => {
        // Count text as it streams in — character-level, not real tokens.
        // Good enough for a visual meter; we'll ship a tokenizer later.
        if (data && typeof data === "object") {
          const delta = data.delta || data.content_block || data;
          const text = delta?.text || delta?.partial_text || "";
          if (typeof text === "string" && text.length) {
            charCount += text.length;
            deltas += 1;
          }
        }
        emit("stream-event", {
          event,
          data,
          elapsedMs: performance.now() - startedAt,
          charCount,
          deltas,
        });
      },
      () => {
        emit("stream-event", {
          event: "stream_close",
          elapsedMs: performance.now() - startedAt,
          charCount,
          deltas,
        });
      },
      (err) => {
        emit("stream-event", {
          event: "stream_error",
          error: String(err),
          elapsedMs: performance.now() - startedAt,
        });
      }
    );

    // Return a brand-new Response built from the untouched tee — claude.ai sees
    // exactly what Anthropic sent it.
    return new Response(toApp, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  };

  // --- also tap XHR fallback (claude.ai may use fetch exclusively, but be safe)
  // Skipped for now — fetch is where everything lives today.

  console.log("[claude-burn] fetch tap installed");
})();
