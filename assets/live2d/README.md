# assets/live2d/

Drop your Live2D Cubism 4 model here. Expected layout:

```
assets/live2d/
└── <modelName>/
    ├── <modelName>.model3.json
    ├── <modelName>.moc3
    ├── textures/
    │   └── texture_00.png
    ├── motions/
    │   ├── idle.motion3.json
    │   ├── happy.motion3.json
    │   └── …
    └── expressions/   (optional)
        └── …
```

The extension loads `assets/live2d/<modelName>/<modelName>.model3.json`
via `fetch(chrome.runtime.getURL(path))`. The model name is set in the
popup under **Live2D model folder**.

## Free starter model: Hiyori

The Live2D Cubism SDK samples ship with a model called **Hiyori** that is
free for personal and small-indie commercial use. To use her:

1. Download the Cubism 4 SDK for Web:
   <https://www.live2d.com/en/sdk/download/web/>
2. Copy `Samples/Resources/Hiyori` into `assets/live2d/Hiyori/`.
3. In the extension popup, set **Live2D model folder** to `Hiyori`.

## Motion naming

The character engine triggers motions by group name. Map them in the model
JSON like this (edit the `Motions` section of `Hiyori.model3.json`):

```json
"Motions": {
  "idle":  [{ "File": "motions/idle.motion3.json" }],
  "start": [{ "File": "motions/perk.motion3.json" }],
  "burn":  [{ "File": "motions/excited.motion3.json" }],
  "tool":  [{ "File": "motions/thinking.motion3.json" }],
  "done":  [{ "File": "motions/satisfied.motion3.json" }],
  "error": [{ "File": "motions/sad.motion3.json" }]
}
```

Any missing group falls back to `idle` without erroring.

## Licensing

Live2D models you did not create yourself are copyrighted artwork. Only
include models whose license permits bundling / redistribution. If you ship
the extension on the Chrome Web Store with a model baked in, you must have
the artist's permission.

Model folders are gitignored by default so you don't accidentally commit a
licensed model to a public repo.
