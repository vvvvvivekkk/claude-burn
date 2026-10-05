// live2d-engine.js — Live2D Cubism 4 character via Pixi + pixi-live2d-display.
//
// Expects three global scripts to be loaded on the page before this module
// runs: PIXI (vendor/pixi.min.js), Live2DCubismCore (vendor/live2dcubismcore.min.js),
// and the pixi-live2d-display UMD build which attaches PIXI.live2d.
//
// Those three are loaded by overlay.js via chrome.runtime.getURL() + a
// one-time injection into <head>. This file assumes they're there.
//
// If any part fails (missing vendor files, missing model, Pixi can't init),
// create() returns null and the overlay falls back to the SVG engine.

const MODEL_PATH_DEFAULT = "Hiyori/Hiyori.model3.json"; // relative to assets/live2d/

export const create = async (settings) => {
  if (!window.PIXI || !window.PIXI.live2d) {
    console.warn("[claude-burn] Pixi / pixi-live2d-display not loaded; falling back to SVG");
    return null;
  }
  if (!window.Live2DCubismCore) {
    console.warn("[claude-burn] Live2DCubismCore missing; falling back to SVG");
    return null;
  }

  const modelFolder = (settings && settings.live2dModel) || MODEL_PATH_DEFAULT;
  const modelUrl = chrome.runtime.getURL("assets/live2d/" + modelFolder);

  let app = null;
  let model = null;
  let hostEl = null;
  let canvasEl = null;
  let blinkTimer = 0;

  // ---- state we drive the model with --------------------------------------
  let mouthTarget = 0;
  let mouthValue = 0;
  let mood = "idle";

  const mount = async (host) => {
    hostEl = host;
    canvasEl = document.createElement("canvas");
    canvasEl.className = "char-canvas";
    canvasEl.width = 300; canvasEl.height = 400;
    host.appendChild(canvasEl);

    app = new PIXI.Application({
      view: canvasEl,
      autoStart: true,
      backgroundAlpha: 0,
      resolution: window.devicePixelRatio || 1,
      antialias: true,
    });

    try {
      model = await PIXI.live2d.Live2DModel.from(modelUrl);
    } catch (err) {
      console.warn("[claude-burn] model load failed:", err);
      app.destroy(true);
      return false;
    }

    // scale + center
    const scale = Math.min(canvasEl.width / model.width, canvasEl.height / model.height) * 0.9;
    model.scale.set(scale);
    model.x = canvasEl.width / 2 - (model.width * scale) / 2;
    model.y = canvasEl.height - model.height * scale;

    app.stage.addChild(model);

    // start the per-frame driver — pure state application, no event handlers here
    app.ticker.add(tick);

    // kick off idle motion
    tryMotion("idle");
    return true;
  };

  // ---- per-frame tick ------------------------------------------------------
  const tick = (deltaFrames) => {
    const dt = deltaFrames / 60; // seconds-ish

    // mouth lerp
    mouthValue += (mouthTarget - mouthValue) * Math.min(1, dt * 12);
    setParam("ParamMouthOpenY", mouthValue);

    // mouth target decays — each delta pulse opens, then closes
    mouthTarget *= Math.max(0, 1 - dt * 6);

    // blinks every 3–6s
    blinkTimer -= dt;
    if (blinkTimer <= 0) {
      doBlink();
      blinkTimer = 3 + Math.random() * 3;
    }
  };

  // ---- helpers -------------------------------------------------------------
  const setParam = (name, value) => {
    if (!model) return;
    try { model.internalModel.coreModel.setParameterValueById(name, value); } catch {}
  };

  const doBlink = () => {
    if (!model) return;
    const start = performance.now();
    const loop = (now) => {
      const t = (now - start) / 180;
      if (t >= 1) { setParam("ParamEyeLOpen", 1); setParam("ParamEyeROpen", 1); return; }
      const v = t < 0.5 ? 1 - t * 2 : (t - 0.5) * 2;
      setParam("ParamEyeLOpen", v);
      setParam("ParamEyeROpen", v);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  };

  const tryMotion = (group) => {
    if (!model) return;
    try { model.motion(group); } catch { /* group missing — fallback to idle */
      try { model.motion("idle"); } catch {}
    }
  };

  return {
    kind: "live2d",

    async mount(host) {
      const ok = await mount(host);
      if (!ok) return null;
      return canvasEl;
    },

    setMood(nextMood) {
      if (nextMood === mood) return;
      mood = nextMood;
      tryMotion(nextMood);
    },

    onDelta({ tps, chars }) {
      // open mouth proportional to tokens/sec; cap at 1.0
      mouthTarget = Math.min(1, 0.3 + tps / 120);
    },

    destroy() {
      try { app?.destroy(true); } catch {}
      app = null; model = null;
      canvasEl?.remove();
      canvasEl = null;
    },
  };
};
