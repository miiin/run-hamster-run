(function () {
  const stage = document.querySelector('.stage');
  const hamsterEl = document.getElementById('hamster');
  const speedEl = document.getElementById('speed');
  const frames = window.HAMSTER_FRAMES;

  const RUN_FRAMES = frames.run;
  const WALK_FRAMES = [frames.idle[0], frames.idle[1]];
  const SIT_FRAME = frames.idle[2];

  const STATE = { RUN: 'run', WALK: 'walk', SIT: 'sit' };
  const WALK_SPEED_PX = 22;
  const WALK_FRAME_MS = 600;
  const SIT_MIN_MS = 3000;
  const SIT_MAX_MS = 10000;
  const FLIP_MIN_MS = 1000;
  const FLIP_MAX_MS = 4000;
  const SIT_TRIGGER_MIN_MS = 2000;
  const SIT_TRIGGER_MAX_MS = 6000;

  let state = STATE.WALK;
  let cps = 0;
  let idleThreshold = 0.2;
  let hamsterX = 0;
  let direction = 1;
  let frameIdx = 0;
  let lastFrameTime = 0;
  let sitUntil = 0;
  let nextFlipAt = 0;
  let nextSitAt = 0;
  let lastTickTime = performance.now();

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function maxX() {
    return Math.max(0, stage.clientWidth - hamsterEl.clientWidth);
  }

  function setFrame(src) {
    if (hamsterEl.getAttribute('src') !== src) hamsterEl.src = src;
  }

  function applyTransform() {
    hamsterEl.style.transform = `translateX(${hamsterX}px) scaleX(${direction})`;
  }

  function runFrameInterval() {
    const ms = 220 - cps * 12;
    return Math.max(30, Math.min(220, ms));
  }

  function advanceFrame(now, list, intervalMs) {
    if (!lastFrameTime) lastFrameTime = now;
    if (now - lastFrameTime >= intervalMs) {
      frameIdx = (frameIdx + 1) % list.length;
      setFrame(list[frameIdx]);
      lastFrameTime = now;
    }
  }

  function enterRun() {
    state = STATE.RUN;
    frameIdx = 0;
    lastFrameTime = 0;
    hamsterX = maxX() / 2;
    direction = 1;
    applyTransform();
  }

  function enterWalk() {
    state = STATE.WALK;
    frameIdx = 0;
    lastFrameTime = 0;
    const now = performance.now();
    nextFlipAt = now + rand(FLIP_MIN_MS, FLIP_MAX_MS);
    nextSitAt = now + rand(SIT_TRIGGER_MIN_MS, SIT_TRIGGER_MAX_MS);
  }

  function enterSit() {
    state = STATE.SIT;
    setFrame(SIT_FRAME);
    sitUntil = performance.now() + rand(SIT_MIN_MS, SIT_MAX_MS);
  }

  function tick(now) {
    const dt = Math.min(0.1, (now - lastTickTime) / 1000);
    lastTickTime = now;

    const wantsRun = cps > idleThreshold;
    if (wantsRun && state !== STATE.RUN) {
      enterRun();
    } else if (!wantsRun && state === STATE.RUN) {
      enterWalk();
    }

    if (state === STATE.RUN) {
      advanceFrame(now, RUN_FRAMES, runFrameInterval());
    } else if (state === STATE.WALK) {
      if (now >= nextSitAt) {
        enterSit();
      } else {
        if (now >= nextFlipAt) {
          direction *= -1;
          nextFlipAt = now + rand(FLIP_MIN_MS, FLIP_MAX_MS);
        }
        hamsterX += WALK_SPEED_PX * direction * dt;
        const limit = maxX();
        if (hamsterX >= limit) {
          hamsterX = limit;
          direction = -1;
          nextFlipAt = now + rand(FLIP_MIN_MS, FLIP_MAX_MS);
        } else if (hamsterX <= 0) {
          hamsterX = 0;
          direction = 1;
          nextFlipAt = now + rand(FLIP_MIN_MS, FLIP_MAX_MS);
        }
        advanceFrame(now, WALK_FRAMES, WALK_FRAME_MS);
        applyTransform();
      }
    } else if (state === STATE.SIT) {
      applyTransform();
      if (now >= sitUntil) {
        enterWalk();
      }
    }

    requestAnimationFrame(tick);
  }

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type !== 'speed') return;
    cps = msg.cps;
    idleThreshold = msg.idleThreshold ?? idleThreshold;
    speedEl.textContent = cps.toFixed(1) + ' cps';
  });

  window.addEventListener('resize', () => {
    hamsterX = Math.max(0, Math.min(maxX(), hamsterX));
    applyTransform();
  });

  setFrame(WALK_FRAMES[0]);
  applyTransform();
  requestAnimationFrame(tick);
})();
