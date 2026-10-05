// character.js — a tiny abstraction so overlay.js doesn't care whether the
// character on screen is an inline SVG, a sprite sheet, or a Live2D rig.
//
// Every engine implements the same four methods:
//   mount(hostEl)        attach yourself inside hostEl (a shadow-root child)
//   setMood(mood)        'idle' | 'start' | 'burn' | 'tool' | 'done' | 'error'
//   onDelta(deltaInfo)   called on every content_block_delta — use for mouth
//                        sync, flame intensity, breathing speedups, etc.
//   destroy()            cleanup
//
// overlay.js picks an engine at mount time based on settings.characterEngine.
// Default is 'svg' because it works with zero assets. 'live2d' kicks in when
// the user has dropped a model into assets/live2d/ and toggled it in the popup.

export const MOODS = ["idle", "start", "burn", "tool", "done", "error"];

export const makeCharacterEngine = (kind, settings) => {
  switch (kind) {
    case "live2d": return makeLive2DEngine(settings);
    case "svg":
    default:       return makeSvgEngine(settings);
  }
};

// Engines themselves live in sibling files; this module stays small so it can
// be imported both by overlay.js (page world) and by any future control panel.
// Dynamic imports happen at the call site to keep startup fast.
const makeSvgEngine    = (s) => import("./engines/svg-engine.js").then(m => m.create(s));
const makeLive2DEngine = (s) => import("./engines/live2d-engine.js").then(m => m.create(s));
