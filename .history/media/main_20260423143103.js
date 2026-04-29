(function () {
  const vscode = acquireVsCodeApi();
  const stage = document.querySelector('.stage');
  const hamsterEl = document.getElementById('hamster');
  const speedEl = document.getElementById('speed');
  const seedEl = document.getElementById('seed');
  const scoreEl = document.getElementById('score');
  const frames = window.HAMSTER_FRAMES;

  const RUN_FRAMES = frames.run;
  const WALK_FRAMES = [frames.idle[0], frames.idle[1]];
  const SIT_FRAME = frames.idle[2];
  const EAT_FRAME = frames.eat;
  const CHEW_FRAMES = [SIT_FRAME, EAT_FRAME];

  const STATE = { RUN: 'run', WALK: 'walk', SIT: 'sit', SEEK: 'seek', EAT: 'eat' };
  const WALK_SPEED_PX = 22;
  const SEEK_SPEED_PX = 40;
  const WALK_FRAME_MS = 600;
  const CHEW_FRAME_MS = 260;
  const SIT_MIN_MS = 1000;
  const SIT_MAX_MS = 5000;
  const EAT_MIN_MS = 4000;
  const EAT_MAX_MS = 8000;
  const FLIP_MIN_MS = 1000;
  const FLIP_MAX_MS = 4000;
  const SIT_TRIGGER_MIN_MS = 3000;
  const SIT_TRIGGER_MAX_MS = 10000;
  const SEED_REACH_PX = 4;
  const COIN_PROBABILITY = 0.2;
  const HEART_VALUE = 1;
  const COIN_VALUE = 10;

  const FIRE_ENTER_CPS = 15;
  const FIRE_EXIT_CPS = 9;
  const FIRE_HOLD_MS = 5000;
  const FIRE_BONUS = 50;

  const KONAMI_DURATION_MS = 30000;
  const KONAMI_MULTIPLIER = 2;
  const KONAMI_SEQUENCE = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];

  let state = STATE.WALK;
  let cps = 0;
  let idleThreshold = 0.2;
  let hamsterX = 0;
  let direction = 1;
  let frameIdx = 0;
  let lastFrameTime = 0;
  let sitUntil = 0;
  let eatUntil = 0;
  let nextFlipAt = 0;
  let nextSitAt = 0;
  let lastTickTime = performance.now();
  let seedX = -1;

  let fireSince = 0;
  let fireActive = false;
  let konamiUntil = 0;
  let konamiBuffer = [];

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function maxX() {
    return Math.max(0, stage.clientWidth - hamsterEl.clientWidth);
  }

  function hamsterCenter() {
    return hamsterX + hamsterEl.clientWidth / 2;
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

  function spawnSeed(x) {
    seedX = Math.max(0, Math.min(stage.clientWidth, x));
    seedEl.style.left = seedX + 'px';
    seedEl.hidden = false;
    seedEl.classList.remove('drop');
    void seedEl.offsetWidth;
    seedEl.classList.add('drop');
  }

  function consumeSeed() {
    seedX = -1;
    seedEl.hidden = true;
    seedEl.classList.remove('drop');
    grantReward();
  }

  function grantReward() {
    const isCoin = Math.random() < COIN_PROBABILITY;
    const kind = isCoin ? 'coin' : 'heart';
    const baseValue = isCoin ? COIN_VALUE : HEART_VALUE;
    const value = baseValue * (isKonamiActive() ? KONAMI_MULTIPLIER : 1);
    spawnReward(kind, value);
    vscode.postMessage({ type: 'addScore', value });
  }

  function spawnReward(kind, value) {
    const el = document.createElement('div');
    el.className = 'reward ' + kind;
    const valueEl = document.createElement('span');
    valueEl.className = 'value';
    valueEl.textContent = '+' + value;
    el.appendChild(valueEl);
    el.style.left = hamsterCenter() + 'px';
    el.style.bottom = 16 + hamsterEl.clientHeight + 4 + 'px';
    stage.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  function showToast(text, kind) {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = text;
    stage.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  function isKonamiActive() {
    return performance.now() < konamiUntil;
  }

  function checkFire(now) {
    if (state !== STATE.RUN) {
      fireSince = 0;
      if (fireActive) exitFire();
      return;
    }
    if (cps >= FIRE_ENTER_CPS) {
      if (fireSince === 0) fireSince = now;
      if (!fireActive && now - fireSince >= FIRE_HOLD_MS) {
        enterFire();
      }
    } else if (cps < FIRE_EXIT_CPS) {
      fireSince = 0;
      if (fireActive) exitFire();
    }
  }

  function enterFire() {
    fireActive = true;
    hamsterEl.classList.add('on-fire');
    showToast('FEVER!', 'fire');
    const bonus = FIRE_BONUS * (isKonamiActive() ? KONAMI_MULTIPLIER : 1);
    vscode.postMessage({ type: 'addScore', value: bonus });
  }

  function exitFire() {
    fireActive = false;
    hamsterEl.classList.remove('on-fire');
  }

  function triggerKonami() {
    const wasActive = isKonamiActive();
    konamiUntil = performance.now() + KONAMI_DURATION_MS;
    document.body.classList.add('konami');
    showToast(wasActive ? 'KONAMI x2!' : 'KONAMI!', 'konami');
    setTimeout(() => {
      if (!isKonamiActive()) document.body.classList.remove('konami');
    }, KONAMI_DURATION_MS + 50);
  }

  function enterRun() {
    state = STATE.RUN;
    frameIdx = 0;
    setFrame(RUN_FRAMES[0]);
    lastFrameTime = performance.now();
    hamsterX = maxX() / 2;
    direction = 1;
    applyTransform();
  }

  function enterWalk() {
    state = STATE.WALK;
    frameIdx = 0;
    setFrame(WALK_FRAMES[0]);
    const now = performance.now();
    lastFrameTime = now;
    nextFlipAt = now + rand(FLIP_MIN_MS, FLIP_MAX_MS);
    nextSitAt = now + rand(SIT_TRIGGER_MIN_MS, SIT_TRIGGER_MAX_MS);
  }

  function enterSit() {
    state = STATE.SIT;
    setFrame(SIT_FRAME);
    sitUntil = performance.now() + rand(SIT_MIN_MS, SIT_MAX_MS);
  }

  function enterSeek() {
    state = STATE.SEEK;
    frameIdx = 0;
    setFrame(WALK_FRAMES[0]);
    lastFrameTime = performance.now();
  }

  function enterEat() {
    state = STATE.EAT;
    frameIdx = 0;
    setFrame(SIT_FRAME);
    const now = performance.now();
    lastFrameTime = now;
    eatUntil = now + rand(EAT_MIN_MS, EAT_MAX_MS);
  }

  function tick(now) {
    const dt = Math.min(0.1, (now - lastTickTime) / 1000);
    lastTickTime = now;
    checkFire(now);

    const wantsRun = cps > idleThreshold;
    if (wantsRun && state !== STATE.RUN) {
      enterRun();
    } else if (!wantsRun && state === STATE.RUN) {
      seedX >= 0 ? enterSeek() : enterWalk();
    }

    if (state === STATE.RUN) {
      advanceFrame(now, RUN_FRAMES, runFrameInterval());
    } else if (state === STATE.SEEK) {
      const dx = seedX - hamsterCenter();
      if (Math.abs(dx) <= SEED_REACH_PX) {
        hamsterX = Math.max(0, Math.min(maxX(), seedX - hamsterEl.clientWidth / 2));
        applyTransform();
        enterEat();
      } else {
        direction = dx > 0 ? 1 : -1;
        let next = hamsterX + SEEK_SPEED_PX * direction * dt;
        next = Math.max(0, Math.min(maxX(), next));
        const nextCenter = next + hamsterEl.clientWidth / 2;
        if ((dx > 0 && nextCenter > seedX) || (dx < 0 && nextCenter < seedX)) {
          next = seedX - hamsterEl.clientWidth / 2;
          next = Math.max(0, Math.min(maxX(), next));
        }
        hamsterX = next;
        advanceFrame(now, WALK_FRAMES, WALK_FRAME_MS);
        applyTransform();
      }
    } else if (state === STATE.EAT) {
      applyTransform();
      advanceFrame(now, CHEW_FRAMES, CHEW_FRAME_MS);
      if (now >= eatUntil) {
        consumeSeed();
        enterWalk();
      }
    } else if (state === STATE.WALK) {
      if (seedX >= 0) {
        enterSeek();
      } else if (now >= nextSitAt) {
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
      if (seedX >= 0) {
        enterSeek();
      } else if (now >= sitUntil) {
        enterWalk();
      }
    }

    requestAnimationFrame(tick);
  }

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'speed') {
      cps = msg.cps;
      idleThreshold = msg.idleThreshold ?? idleThreshold;
      speedEl.textContent = cps.toFixed(1) + ' cps';
    } else if (msg.type === 'score') {
      scoreEl.textContent = msg.value.toLocaleString();
    }
  });

  window.addEventListener('resize', () => {
    hamsterX = Math.max(0, Math.min(maxX(), hamsterX));
    applyTransform();
  });

  stage.addEventListener('click', (e) => {
    const rect = stage.getBoundingClientRect();
    const x = e.clientX - rect.left;
    spawnSeed(x);
    if (state !== STATE.RUN) {
      enterSeek();
    }
  });

  document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key.length > 1 && !key.startsWith('arrow')) return;
    konamiBuffer.push(key);
    if (konamiBuffer.length > KONAMI_SEQUENCE.length) konamiBuffer.shift();
    if (konamiBuffer.length === KONAMI_SEQUENCE.length && konamiBuffer.every((v, i) => v === KONAMI_SEQUENCE[i])) {
      triggerKonami();
      konamiBuffer = [];
    }
  });

  setFrame(WALK_FRAMES[0]);
  applyTransform();
  vscode.postMessage({ type: 'requestScore' });
  requestAnimationFrame(tick);
})();
