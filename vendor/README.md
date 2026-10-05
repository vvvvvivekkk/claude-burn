# vendor/

Third-party runtime libraries bundled with the extension. These files must be
present for the Live2D character engine to work. The SVG engine (default) does
not need them.

Chrome Manifest V3 forbids loading remote scripts, so everything has to live
inside the extension folder — no CDNs at runtime.

## Required files

Drop these three files into this directory:

| File | Source | Size |
|---|---|---|
| `pixi.min.js` | <https://unpkg.com/pixi.js@6.5.10/dist/browser/pixi.min.js> | ~430 KB |
| `pixi-live2d-display-cubism4.min.js` | <https://unpkg.com/pixi-live2d-display@0.4.0/dist/cubism4.min.js> | ~85 KB |
| `live2dcubismcore.min.js` | <https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js> | ~55 KB |

## One-shot download

From the repo root:

```bash
mkdir -p vendor
curl -sSL https://unpkg.com/pixi.js@6.5.10/dist/browser/pixi.min.js \
  -o vendor/pixi.min.js
curl -sSL https://unpkg.com/pixi-live2d-display@0.4.0/dist/cubism4.min.js \
  -o vendor/pixi-live2d-display-cubism4.min.js
curl -sSL https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js \
  -o vendor/live2dcubismcore.min.js
```

## Why pinned versions?

- **Pixi v6** — pixi-live2d-display 0.4.x is built against Pixi v6; the v7
  migration is still in the 0.5-beta line.
- **pixi-live2d-display 0.4.0** — latest stable at time of writing. The
  `cubism4` build is the right one for modern `.model3.json` models (the
  `cubism2` build is for the older `.moc` format).
- **Cubism 4 core** — Live2D's official runtime for Cubism 4 models. Needed
  because it's a closed-source binary blob Anthropic / anyone else can't
  redistribute inside npm; you fetch it from Live2D directly.

## Licensing

- Pixi.js — MIT.
- pixi-live2d-display — MIT.
- Live2D Cubism Core — proprietary, free for personal and small-indie
  commercial use under the Live2D Cubism SDK Release License Agreement.
  Read it before distributing: <https://www.live2d.com/en/sdk/license/>

These files are intentionally **not checked into git**; see `.gitignore`.
