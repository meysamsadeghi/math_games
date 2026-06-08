/* ============================================================
   Rocket Launch Quiz — game logic
   Wordless multiplication game (digits, ×, =, ? and icons only).
   Plain script (no modules) so it runs from file:// by double-click.
   ============================================================ */
(function () {
  "use strict";

  // -------------------- Config --------------------
  var MAX_TABLE = 10;          // missions: 1× .. 10×
  var FACTS_PER_TABLE = 10;    // t×1 .. t×10
  var STEPS_TO_PLANET = 8;     // correct answers needed to reach the planet
  var FUEL_MS = 22000;         // time for the fuel bar to fully drain (gentle, relaxed)
  var SAVE_KEY = "rocketQuiz.v1";

  // Planets shown per mission (index 0 unused; table t -> PLANETS[t])
  var PLANETS = ["", "🌑", "🌕", "🪐", "🔴", "🟠", "🟢", "🔵", "🟣", "⭐", "🌟"];

  // Rocket skins: id, emoji, price (0 = free/owned by default)
  var SKINS = [
    { id: "classic", emoji: "🚀", price: 0 },
    { id: "ufo",     emoji: "🛸", price: 30 },
    { id: "plane",   emoji: "🛩️", price: 50 },
    { id: "heli",    emoji: "🚁", price: 70 },
    { id: "sat",     emoji: "🛰️", price: 100 },
    { id: "star",    emoji: "💫", price: 140 },
    { id: "comet",   emoji: "☄️", price: 180 },
    { id: "dragon",  emoji: "🐉", price: 250 }
  ];

  // Reward stickers per table (collectibles)
  var STICKERS = ["", "🌝", "🌛", "🪐", "👽", "🛸", "🌠", "🌌", "🚀", "🏆", "👑"];

  // -------------------- State --------------------
  var defaultState = function () {
    return {
      maxUnlocked: 1,         // highest unlocked table
      stars: {},              // table -> best star count (0..3)
      coins: 0,
      ownedSkins: ["classic"],
      equippedSkin: "classic",
      stickers: [],           // collected table numbers
      weights: {},            // "a×b" -> mastery weight (higher = practice more)
      muted: false,
      timerOn: true           // fuel-bar timer on by default; press T to toggle
    };
  };

  var state = loadState();

  function loadState() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        var d = defaultState();
        for (var k in d) { if (!(k in s)) s[k] = d[k]; }
        return s;
      }
    } catch (e) { /* ignore */ }
    return defaultState();
  }

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  // -------------------- DOM helpers --------------------
  function $(id) { return document.getElementById(id); }
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }

  var screens = {
    map: $("screen-map"),
    mission: $("screen-mission"),
    reward: $("screen-reward"),
    hangar: $("screen-hangar")
  };

  function showScreen(name) {
    for (var k in screens) screens[k].classList.toggle("active", k === name);
    if (name === "mission") { resizeGameCanvas(); }
    if (name === "reward") { resizeConfetti(); }
  }

  // ============================================================
  //  AUDIO (Web Audio API, synthesized — no files)
  // ============================================================
  var actx = null;
  function audio() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { actx = null; }
    }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (state.muted) return;
    var ctx = audio(); if (!ctx) return;
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + dur + 0.02);
  }

  function noiseBurst(dur, vol, freqStart, freqEnd) {
    if (state.muted) return;
    var ctx = audio(); if (!ctx) return;
    var n = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, n, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var filt = ctx.createBiquadFilter(); filt.type = "bandpass";
    filt.frequency.setValueAtTime(freqStart || 800, ctx.currentTime);
    if (freqEnd) filt.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + dur);
    var g = ctx.createGain(); g.gain.value = vol || 0.25;
    src.connect(filt); filt.connect(g); g.connect(ctx.destination);
    src.start();
  }

  var sfx = {
    type: function () { tone(440, 0.04, "square", 0.05); },
    whoosh: function () { noiseBurst(0.5, 0.3, 300, 2200); },
    correct: function (combo) {
      var base = 660 + Math.min(combo, 8) * 60;
      tone(base, 0.12, "sine", 0.25);
      setTimeout(function () { tone(base * 1.5, 0.14, "sine", 0.22); }, 90);
    },
    wrong: function () { tone(300, 0.35, "sawtooth", 0.18, 140); },
    coin: function () { tone(1200, 0.08, "square", 0.15); setTimeout(function(){ tone(1700, 0.1, "square", 0.13); }, 70); },
    fanfare: function () {
      var notes = [523, 659, 784, 1046];
      notes.forEach(function (f, i) { setTimeout(function () { tone(f, 0.22, "triangle", 0.22); }, i * 130); });
    }
  };

  // ============================================================
  //  STARFIELD BACKGROUND
  // ============================================================
  var bg = $("stars-bg"), bgx = bg.getContext("2d"), bgStars = [];
  function resizeBg() {
    bg.width = window.innerWidth; bg.height = window.innerHeight;
    bgStars = [];
    var count = Math.round((bg.width * bg.height) / 6000);
    for (var i = 0; i < count; i++) {
      bgStars.push({ x: Math.random() * bg.width, y: Math.random() * bg.height,
        r: Math.random() * 1.6 + 0.3, tw: Math.random() * Math.PI * 2, sp: Math.random() * 0.04 + 0.01 });
    }
  }
  function drawBg() {
    bgx.clearRect(0, 0, bg.width, bg.height);
    var grad = bgx.createLinearGradient(0, 0, 0, bg.height);
    grad.addColorStop(0, "#0b1026"); grad.addColorStop(1, "#1b2350");
    bgx.fillStyle = grad; bgx.fillRect(0, 0, bg.width, bg.height);
    for (var i = 0; i < bgStars.length; i++) {
      var s = bgStars[i]; s.tw += s.sp;
      var a = 0.5 + Math.sin(s.tw) * 0.5;
      bgx.globalAlpha = a; bgx.fillStyle = "#fff";
      bgx.beginPath(); bgx.arc(s.x, s.y, s.r, 0, Math.PI * 2); bgx.fill();
    }
    bgx.globalAlpha = 1;
    requestAnimationFrame(drawBg);
  }

  // ============================================================
  //  MISSION MAP
  // ============================================================
  function buildMap() {
    $("map-coins").textContent = state.coins;
    var trail = $("planet-trail");
    trail.innerHTML = "";
    // column-reverse means we append 1..MAX and table 1 ends at bottom
    for (var t = 1; t <= MAX_TABLE; t++) {
      var unlocked = t <= state.maxUnlocked;
      var node = el("div", "planet-node" + (unlocked ? "" : " locked") + (t === state.maxUnlocked ? " current" : ""));
      node.setAttribute("data-table", t);

      var emoji = el("div", "planet-emoji"); emoji.textContent = PLANETS[t];
      node.appendChild(emoji);

      var label = el("div", "planet-table");
      label.innerHTML = t + '<span class="x">×</span>';
      node.appendChild(label);

      var starsWrap = el("div", "planet-stars");
      var earned = state.stars[t] || 0;
      for (var i = 0; i < 3; i++) {
        var st = el("span", i < earned ? "on" : "off"); st.textContent = "★";
        starsWrap.appendChild(st);
      }
      node.appendChild(starsWrap);

      if (!unlocked) { var lock = el("div", "planet-lock"); lock.textContent = "🔒"; node.appendChild(lock); }

      if (unlocked) {
        node.addEventListener("click", (function (table) {
          return function () { sfx.type(); startMission(table); };
        })(t));
      }
      trail.appendChild(node);
    }
  }

  // ============================================================
  //  SMART-PRACTICE QUESTION ENGINE
  // ============================================================
  function factKey(a, b) { return a + "x" + b; }

  function weightOf(a, b) {
    var k = factKey(a, b);
    if (!(k in state.weights)) state.weights[k] = 3; // start neutral-ish
    return state.weights[k];
  }

  // Pick next fact for the active table by weighted random; avoid immediate repeat.
  function nextQuestion(table, avoid) {
    var entries = [];
    var total = 0;
    for (var b = 1; b <= FACTS_PER_TABLE; b++) {
      if (avoid && b === avoid) continue;
      var w = weightOf(table, b);
      entries.push({ b: b, w: w });
      total += w;
    }
    var r = Math.random() * total;
    for (var i = 0; i < entries.length; i++) {
      r -= entries[i].w;
      if (r <= 0) return { a: table, b: entries[i].b, answer: table * entries[i].b };
    }
    var last = entries[entries.length - 1];
    return { a: table, b: last.b, answer: table * last.b };
  }

  function bumpWeightWrong(a, b) {
    var k = factKey(a, b);
    state.weights[k] = Math.min((state.weights[k] || 3) + 4, 20);
  }
  function bumpWeightCorrect(a, b) {
    var k = factKey(a, b);
    state.weights[k] = Math.max((state.weights[k] || 3) - 1, 1);
  }

  // ============================================================
  //  MISSION / GAMEPLAY
  // ============================================================
  var mission = null; // active mission object

  function startMission(table) {
    mission = {
      table: table,
      progress: 0,            // steps reached toward planet
      answered: 0,
      misses: 0,
      coinsEarned: 0,
      combo: 0,
      current: null,
      buffer: "",
      locked: false,          // input locked during animation
      fuel: 1,                // 1 -> 0
      fuelStart: 0,
      bonusThisQ: true
    };
    $("mission-coins").textContent = state.coins;
    buildProgressDots();
    rocket.reset();
    showScreen("mission");
    audio(); // unlock audio on the click that got us here
    askQuestion(true);
    startGameLoop();
  }

  function buildProgressDots() {
    var wrap = $("progress-dots");
    wrap.innerHTML = "";
    for (var i = 0; i < STEPS_TO_PLANET; i++) {
      var d = el("div", "dot"); wrap.appendChild(d);
    }
    var goal = el("div", "dot goal"); wrap.appendChild(goal);
  }
  function refreshProgressDots() {
    var dots = $("progress-dots").querySelectorAll(".dot");
    for (var i = 0; i < dots.length; i++) {
      if (!dots[i].classList.contains("goal"))
        dots[i].classList.toggle("done", i < mission.progress);
    }
  }

  function askQuestion(first) {
    var avoid = mission.current ? mission.current.b : null;
    mission.current = nextQuestion(mission.table, first ? null : avoid);
    mission.buffer = "";
    mission.bonusThisQ = true;
    mission.fuelStart = performance.now();
    mission.fuel = 1;
    $("eq-a").textContent = mission.current.a;
    $("eq-b").textContent = mission.current.b;
    var ans = $("eq-answer");
    ans.classList.remove("correct", "wrong");
    renderBuffer();
  }

  function renderBuffer() {
    $("answer-text").textContent = mission.buffer;
  }

  function submitAnswer() {
    if (mission.locked || mission.buffer === "") return;
    var val = parseInt(mission.buffer, 10);
    var q = mission.current;
    if (val === q.answer) onCorrect(); else onWrong();
  }

  function onCorrect() {
    mission.locked = true;
    var q = mission.current;
    bumpWeightCorrect(q.a, q.b);
    mission.combo++;
    mission.answered++;

    // coins: base + combo bonus + speed bonus
    var gained = 2 + Math.min(mission.combo - 1, 5);
    if (mission.bonusThisQ) gained += 2; // answered before fuel ran out
    mission.coinsEarned += gained;
    addCoins(gained, "mission-coins");

    $("eq-answer").classList.add("correct");
    showCombo(mission.combo);
    sfx.correct(mission.combo);
    sfx.coin();
    screens.mission.classList.remove("shake");
    void screens.mission.offsetWidth;
    screens.mission.classList.add("shake");

    rocket.launchStep();

    mission.progress++;
    refreshProgressDots();
    save();

    setTimeout(function () {
      mission.locked = false;
      if (mission.progress >= STEPS_TO_PLANET) finishMission();
      else askQuestion(false);
    }, 700);
  }

  function onWrong() {
    mission.locked = true;
    var q = mission.current;
    bumpWeightWrong(q.a, q.b);
    mission.misses++;
    mission.combo = 0;
    $("eq-answer").classList.add("wrong");
    sfx.wrong();
    rocket.wobble();
    save();
    setTimeout(function () {
      mission.locked = false;
      mission.buffer = "";
      $("eq-answer").classList.remove("wrong");
      renderBuffer();
    }, 600);
  }

  function showCombo(combo) {
    if (combo < 2) return;
    var badge = $("combo-badge");
    badge.textContent = "🔥" + combo;
    badge.classList.remove("show");
    void badge.offsetWidth;
    badge.classList.add("show");
  }

  function finishMission() {
    stopGameLoop();
    var table = mission.table;

    // star rating from misses
    var stars = mission.misses === 0 ? 3 : (mission.misses <= 2 ? 2 : 1);
    var prevStars = state.stars[table] || 0;
    if (stars > prevStars) state.stars[table] = stars;

    // unlock next table
    var newlyUnlocked = false;
    if (table === state.maxUnlocked && table < MAX_TABLE) {
      state.maxUnlocked = table + 1;
      newlyUnlocked = true;
    }

    // sticker collection
    if (state.stickers.indexOf(table) === -1) state.stickers.push(table);

    save();
    showReward(stars, mission.coinsEarned, table, newlyUnlocked);
  }

  // -------------------- Coins helper --------------------
  function addCoins(amt, counterId) {
    state.coins += amt;
    var c = $(counterId);
    if (c) {
      c.textContent = state.coins;
      c.parentElement.classList.remove("coin-bump");
      void c.parentElement.offsetWidth;
      c.parentElement.classList.add("coin-bump");
    }
  }

  // ============================================================
  //  GAME RENDER LOOP (rocket + particles + fuel)
  // ============================================================
  var canvas = $("game-canvas"), gx = canvas.getContext("2d");
  var loopId = null;

  function resizeGameCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    rocket.groundY = canvas.height - 90;
  }

  var rocket = {
    x: 0, y: 0, targetY: 0, groundY: 0, vy: 0,
    wobbleT: 0, particles: [],
    reset: function () {
      this.x = canvas.width / 2;
      this.groundY = canvas.height - 90;
      this.y = this.groundY;
      this.targetY = this.groundY;
      this.vy = 0; this.wobbleT = 0; this.particles = [];
    },
    launchStep: function () {
      // move up toward the planet by one slice of the screen
      var top = 120;
      var slice = (this.groundY - top) / STEPS_TO_PLANET;
      this.targetY = this.groundY - slice * (mission.progress + 1);
      sfx.whoosh();
      this.burst(26);
    },
    wobble: function () { this.wobbleT = 1; this.burst(8, true); },
    burst: function (n, red) {
      for (var i = 0; i < n; i++) {
        this.particles.push({
          x: this.x + (Math.random() * 30 - 15),
          y: this.y + 36,
          vx: (Math.random() * 2 - 1) * 1.4,
          vy: Math.random() * 3 + 1.5,
          life: 1,
          size: Math.random() * 8 + 4,
          red: !!red
        });
      }
    },
    update: function () {
      // ease toward target
      this.y += (this.targetY - this.y) * 0.12;
      // wobble decay
      if (this.wobbleT > 0) this.wobbleT *= 0.9;
      if (this.wobbleT < 0.01) this.wobbleT = 0;
      // particles
      for (var i = this.particles.length - 1; i >= 0; i--) {
        var p = this.particles[i];
        p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.life -= 0.03;
        if (p.life <= 0) this.particles.splice(i, 1);
      }
    },
    draw: function (ctx) {
      // particles (flames)
      for (var i = 0; i < this.particles.length; i++) {
        var p = this.particles[i];
        ctx.globalAlpha = Math.max(p.life, 0);
        ctx.fillStyle = p.red ? "#ff5d6c" : (p.life > 0.5 ? "#ffd23f" : "#ff7b2e");
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // rocket emoji
      var wob = Math.sin(this.wobbleT * 30) * this.wobbleT * 14;
      ctx.save();
      ctx.translate(this.x + wob, this.y);
      ctx.rotate(wob * 0.02);
      ctx.font = "72px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      var skin = SKINS.filter(function (s) { return s.id === state.equippedSkin; })[0] || SKINS[0];
      ctx.fillText(skin.emoji, 0, 0);
      ctx.restore();
    }
  };

  function startGameLoop() {
    if (loopId) return;
    resizeGameCanvas();
    function frame() {
      gx.clearRect(0, 0, canvas.width, canvas.height);
      // fuel drain (skipped entirely when the timer is turned off)
      if (state.timerOn) {
        if (!mission.locked) {
          var elapsed = performance.now() - mission.fuelStart;
          mission.fuel = Math.max(0, 1 - elapsed / FUEL_MS);
          if (mission.fuel <= 0) mission.bonusThisQ = false;
        }
      } else {
        mission.fuel = 1;
      }
      updateFuelUi();
      rocket.update();
      rocket.draw(gx);
      loopId = requestAnimationFrame(frame);
    }
    loopId = requestAnimationFrame(frame);
  }
  function stopGameLoop() {
    if (loopId) { cancelAnimationFrame(loopId); loopId = null; }
  }

  function updateFuelUi() {
    var fill = $("fuel-fill");
    var wrap = document.querySelector("#screen-mission .fuel-wrap");
    if (!state.timerOn) {
      wrap.classList.add("timer-off");
      fill.style.width = "100%";
      fill.style.background = "var(--fuel-full)";
      return;
    }
    wrap.classList.remove("timer-off");
    fill.style.width = (mission.fuel * 100) + "%";
    fill.style.background = mission.fuel < 0.3 ? "var(--fuel-low)" : "var(--fuel-full)";
  }

  // ============================================================
  //  REWARD SCREEN
  // ============================================================
  var confetti = $("confetti-canvas"), cfx = confetti.getContext("2d");
  var confettiPieces = [], confettiId = null;

  function resizeConfetti() { confetti.width = window.innerWidth; confetti.height = window.innerHeight; }

  function showReward(stars, coins, table, newlyUnlocked) {
    showScreen("reward");
    // stars
    var starEls = $("reward-stars").querySelectorAll(".rstar");
    starEls.forEach(function (s) { s.classList.remove("on"); });
    for (var i = 0; i < stars; i++) {
      (function (idx) { setTimeout(function () { starEls[idx].classList.add("on"); sfx.coin(); }, idx * 300); })(i);
    }
    // sticker
    $("reward-sticker").textContent = STICKERS[table];
    // coins
    $("reward-coin-amt").textContent = "+" + coins;

    sfx.fanfare();
    launchConfetti();

    // store next action
    $("btn-reward-next").onclick = function () {
      sfx.type(); stopConfetti();
      if (newlyUnlocked) startMission(table + 1);
      else { buildMap(); showScreen("map"); }
    };
  }

  function launchConfetti() {
    confettiPieces = [];
    var colors = ["#ffd23f", "#28e07a", "#5ad1ff", "#ff5d6c", "#ff8a3d"];
    for (var i = 0; i < 140; i++) {
      confettiPieces.push({
        x: Math.random() * confetti.width,
        y: -Math.random() * confetti.height,
        vx: Math.random() * 2 - 1,
        vy: Math.random() * 3 + 2,
        size: Math.random() * 8 + 4,
        rot: Math.random() * Math.PI,
        vr: Math.random() * 0.2 - 0.1,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
    if (!confettiId) confettiFrame();
  }
  function confettiFrame() {
    cfx.clearRect(0, 0, confetti.width, confetti.height);
    for (var i = 0; i < confettiPieces.length; i++) {
      var p = confettiPieces[i];
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      if (p.y > confetti.height + 20) { p.y = -20; p.x = Math.random() * confetti.width; }
      cfx.save(); cfx.translate(p.x, p.y); cfx.rotate(p.rot);
      cfx.fillStyle = p.color;
      cfx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      cfx.restore();
    }
    confettiId = requestAnimationFrame(confettiFrame);
  }
  function stopConfetti() {
    if (confettiId) { cancelAnimationFrame(confettiId); confettiId = null; }
    cfx.clearRect(0, 0, confetti.width, confetti.height);
  }

  // ============================================================
  //  HANGAR
  // ============================================================
  function buildHangar() {
    $("hangar-coins").textContent = state.coins;
    var equipped = SKINS.filter(function (s) { return s.id === state.equippedSkin; })[0] || SKINS[0];
    $("hangar-preview").textContent = equipped.emoji;

    var grid = $("skin-grid");
    grid.innerHTML = "";
    SKINS.forEach(function (skin) {
      var owned = state.ownedSkins.indexOf(skin.id) !== -1;
      var cell = el("div", "skin-cell" + (owned ? "" : " locked") + (skin.id === state.equippedSkin ? " equipped" : ""));
      cell.textContent = skin.emoji;
      if (!owned) {
        var price = el("div", "price");
        price.innerHTML = '🪙' + skin.price;
        cell.appendChild(price);
      }
      cell.addEventListener("click", function () {
        if (state.ownedSkins.indexOf(skin.id) !== -1) {
          state.equippedSkin = skin.id; sfx.type(); save(); buildHangar();
        } else if (state.coins >= skin.price) {
          state.coins -= skin.price;
          state.ownedSkins.push(skin.id);
          state.equippedSkin = skin.id;
          sfx.coin(); save(); buildHangar();
        } else {
          cell.classList.remove("too-expensive"); void cell.offsetWidth;
          cell.classList.add("too-expensive"); sfx.wrong();
        }
      });
      grid.appendChild(cell);
    });

    // sticker shelf
    var shelf = $("sticker-shelf");
    shelf.innerHTML = "";
    for (var t = 1; t <= MAX_TABLE; t++) {
      var has = state.stickers.indexOf(t) !== -1;
      var s = el("div", "sticker" + (has ? "" : " empty"));
      s.textContent = has ? STICKERS[t] : "❔";
      shelf.appendChild(s);
    }
  }

  // ============================================================
  //  INPUT
  // ============================================================
  document.addEventListener("keydown", function (e) {
    if (!screens.mission.classList.contains("active")) return;
    if (mission == null || mission.locked) return;

    if (e.key >= "0" && e.key <= "9") {
      if (mission.buffer.length < 3) { mission.buffer += e.key; renderBuffer(); sfx.type(); }
      e.preventDefault();
    } else if (e.key === "Backspace") {
      mission.buffer = mission.buffer.slice(0, -1); renderBuffer(); e.preventDefault();
    } else if (e.key === "Enter") {
      submitAnswer(); e.preventDefault();
    }
  });

  // Press T anywhere to toggle the fuel-bar timer on/off (parent control).
  document.addEventListener("keydown", function (e) {
    if (e.key === "t" || e.key === "T") {
      state.timerOn = !state.timerOn;
      if (state.timerOn && mission) mission.fuelStart = performance.now(); // restart fresh
      save();
      sfx.coin();
      e.preventDefault();
    }
  });

  $("btn-launch").addEventListener("click", function () { submitAnswer(); });

  // -------------------- Button wiring --------------------
  $("btn-hangar").addEventListener("click", function () { sfx.type(); buildHangar(); showScreen("hangar"); });
  $("btn-hangar-back").addEventListener("click", function () { sfx.type(); buildMap(); showScreen("map"); });
  $("btn-back").addEventListener("click", function () { sfx.type(); stopGameLoop(); mission = null; buildMap(); showScreen("map"); });
  $("btn-reward-home").addEventListener("click", function () { sfx.type(); stopConfetti(); buildMap(); showScreen("map"); });

  // Mute toggle
  var muteBtn = $("btn-mute");
  function refreshMute() { muteBtn.textContent = state.muted ? "🔇" : "🔊"; }
  muteBtn.addEventListener("click", function () { state.muted = !state.muted; refreshMute(); save(); if (!state.muted) sfx.type(); });
  refreshMute();

  // -------------------- Hidden reset (long-press 2s) --------------------
  (function () {
    var timer = null, zone = $("reset-zone");
    function start() { timer = setTimeout(function () {
      state = defaultState(); save(); buildMap();
      sfx.fanfare();
    }, 2000); }
    function cancel() { if (timer) { clearTimeout(timer); timer = null; } }
    zone.addEventListener("mousedown", start);
    zone.addEventListener("mouseup", cancel);
    zone.addEventListener("mouseleave", cancel);
    zone.addEventListener("touchstart", start, { passive: true });
    zone.addEventListener("touchend", cancel);
  })();

  // -------------------- Resize handling --------------------
  window.addEventListener("resize", function () {
    resizeBg();
    if (screens.mission.classList.contains("active")) resizeGameCanvas();
    if (screens.reward.classList.contains("active")) resizeConfetti();
  });

  // ============================================================
  //  BOOT
  // ============================================================
  resizeBg();
  drawBg();
  buildMap();
  showScreen("map");

})();
