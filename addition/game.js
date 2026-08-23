/* ============================================================
   Garden Add-Venture — game logic
   Wordless addition game (digits, +, =, ? and icons only), 8 levels
   spanning ages ~4 (counting pictures, sums to 5) through ~10
   (two-digit addition with carrying). Plain script (no modules)
   so it runs from file:// by double-click.
   ============================================================ */
(function () {
  "use strict";

  // -------------------- Config --------------------
  var STEPS_TO_STOP = 8;     // correct answers needed to finish a level
  var SAVE_KEY = "gardenAddVenture.v1";

  function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = randInt(0, i); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  // Garden path stop per level, and the critter unlocked on completion.
  var PATH_ICONS = ["🌱", "🌿", "🌻", "🍄", "🌵", "🌴", "🌈", "💎"];
  var CRITTERS   = ["🐛", "🐌", "🐝", "🦋", "🐞", "🐸", "🦔", "🦉"];

  // Icon themes for the two groups being combined (levels 1-2 only). Paired
  // by index so a round always shows two visually distinct objects.
  var THEME_A = ["🍎", "🌻", "⭐", "🐝", "🎈", "🍓", "🍊", "🎀"];
  var THEME_B = ["🍇", "🦋", "🌸", "🐞", "🎁", "🍑", "🍋", "🎯"];

  // Levels: each has a display label, whether it shows counting icons, and
  // a generator that returns the two addends {a, b} for one question.
  var LEVELS = [
    { label: "0–5", icons: true,
      gen: function () { var a = randInt(0, 5); var b = randInt(0, 5 - a); return { a: a, b: b }; } },
    { label: "0–10", icons: true,
      gen: function () { var a = randInt(0, 10); var b = randInt(0, 10 - a); return { a: a, b: b }; } },
    { label: "0–10", icons: false,
      gen: function () { var a = randInt(0, 10); var b = randInt(0, 10 - a); return { a: a, b: b }; } },
    { label: "0–20", icons: false,
      gen: function () { var a = randInt(0, 20); var b = randInt(0, 20 - a); return { a: a, b: b }; } },
    { label: "10–59", icons: false,
      gen: function () { var a = randInt(10, 50); var b = randInt(0, 9); return { a: a, b: b }; } },
    { label: "2-dig", icons: false, // two-digit + two-digit, no carrying
      gen: function () {
        var aOnes = randInt(0, 9), bOnes = randInt(0, 9 - aOnes);
        var aTens = randInt(1, 8), bTens = randInt(1, 9 - aTens);
        return { a: aTens * 10 + aOnes, b: bTens * 10 + bOnes };
      } },
    { label: "2-dig+", icons: false, // two-digit + two-digit, forces carrying
      gen: function () {
        var aOnes = randInt(1, 9), bOnes = randInt(10 - aOnes, 9);
        var aTens = randInt(1, 7), bTens = randInt(1, 8 - aTens);
        return { a: aTens * 10 + aOnes, b: bTens * 10 + bOnes };
      } },
    { label: "10–99", icons: false, // hardest: fully random two-digit pair
      gen: function () { return { a: randInt(10, 99), b: randInt(10, 99) }; } }
  ];
  var MAX_LEVEL = LEVELS.length;

  // -------------------- State --------------------
  function defaultState() {
    return {
      maxUnlocked: 1,   // highest unlocked level
      stars: {},        // level -> best star count (0..3)
      totalStars: 0,     // lifetime correct-answer counter shown in HUD
      critters: [],      // level numbers whose critter has been collected
      muted: false
    };
  }

  var state = loadState();

  function loadState() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        var s = JSON.parse(raw), d = defaultState();
        for (var k in d) { if (!(k in s)) s[k] = d[k]; }
        return s;
      }
    } catch (e) {}
    return defaultState();
  }
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {} }

  // -------------------- DOM helpers --------------------
  function $(id) { return document.getElementById(id); }
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }

  var screens = { map: $("screen-map"), mission: $("screen-mission"), reward: $("screen-reward"), book: $("screen-book") };
  function showScreen(name) { for (var k in screens) screens[k].classList.toggle("active", k === name); }

  // ============================================================
  //  AUDIO (Web Audio API, synthesized — no files, no speech)
  // ============================================================
  var actx = null;
  function audio() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  function tone(freq, dur, type, vol, slideTo) {
    if (state.muted) return;
    var ctx = audio(); if (!ctx) return;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + dur + 0.02);
  }
  var sfx = {
    tap: function () { tone(520, 0.05, "square", 0.06); },
    boop: function (step) { tone(440 + step * 70, 0.12, "sine", 0.22); },
    correct: function (combo) {
      var base = 660 + Math.min(combo || 0, 8) * 40;
      tone(base, 0.12, "sine", 0.25); setTimeout(function () { tone(base * 1.5, 0.16, "sine", 0.22); }, 100);
    },
    wrong: function () { tone(300, 0.3, "sawtooth", 0.16, 180); },
    star: function () { tone(1200, 0.08, "square", 0.14); setTimeout(function () { tone(1700, 0.1, "square", 0.12); }, 70); },
    fanfare: function () { [523, 659, 784, 1046, 1318].forEach(function (f, i) { setTimeout(function () { tone(f, 0.22, "triangle", 0.22); }, i * 120); }); }
  };

  // ============================================================
  //  SOFT GARDEN-SKY BACKGROUND
  // ============================================================
  var bg = $("stars-bg"), bgx = bg.getContext("2d"), sparkles = [];
  function resizeBg() {
    bg.width = window.innerWidth; bg.height = window.innerHeight;
    sparkles = [];
    var count = Math.round((bg.width * bg.height) / 9000);
    for (var i = 0; i < count; i++) {
      sparkles.push({ x: Math.random() * bg.width, y: Math.random() * bg.height,
        r: Math.random() * 1.8 + 0.4, tw: Math.random() * Math.PI * 2, sp: Math.random() * 0.03 + 0.01 });
    }
  }
  function drawBg() {
    var grad = bgx.createLinearGradient(0, 0, 0, bg.height);
    grad.addColorStop(0, "#123524"); grad.addColorStop(1, "#1f6b3a");
    bgx.fillStyle = grad; bgx.fillRect(0, 0, bg.width, bg.height);
    for (var i = 0; i < sparkles.length; i++) {
      var s = sparkles[i]; s.tw += s.sp;
      bgx.globalAlpha = 0.4 + Math.sin(s.tw) * 0.4;
      bgx.fillStyle = "#ffe9a8";
      bgx.beginPath(); bgx.arc(s.x, s.y, s.r, 0, Math.PI * 2); bgx.fill();
    }
    bgx.globalAlpha = 1;
    requestAnimationFrame(drawBg);
  }

  // ============================================================
  //  CONFETTI
  // ============================================================
  var confetti = $("confetti-canvas"), cfx = confetti.getContext("2d");
  var pieces = [], confettiId = null;
  function resizeConfetti() { confetti.width = window.innerWidth; confetti.height = window.innerHeight; }
  function burstConfetti(big) {
    var colors = ["#ffd23f", "#4ade80", "#5ad1ff", "#ff6b6b", "#ff8fc8", "#ff9f45"];
    var n = big ? 160 : 80;
    for (var i = 0; i < n; i++) {
      pieces.push({ x: Math.random() * confetti.width, y: -Math.random() * confetti.height * 0.5,
        vx: Math.random() * 2 - 1, vy: Math.random() * 3 + 2, size: Math.random() * 8 + 4,
        rot: Math.random() * Math.PI, vr: Math.random() * 0.2 - 0.1, life: 1,
        color: colors[Math.floor(Math.random() * colors.length)] });
    }
    if (!confettiId) confettiFrame();
  }
  function confettiFrame() {
    cfx.clearRect(0, 0, confetti.width, confetti.height);
    for (var i = pieces.length - 1; i >= 0; i--) {
      var p = pieces[i];
      p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 0.006;
      if (p.y > confetti.height + 20 || p.life <= 0) { pieces.splice(i, 1); continue; }
      cfx.save(); cfx.translate(p.x, p.y); cfx.rotate(p.rot);
      cfx.globalAlpha = Math.min(1, p.life * 1.5);
      cfx.fillStyle = p.color;
      cfx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      cfx.restore();
    }
    cfx.globalAlpha = 1;
    if (pieces.length) confettiId = requestAnimationFrame(confettiFrame);
    else { cancelAnimationFrame(confettiId); confettiId = null; }
  }

  // ============================================================
  //  GARDEN PATH (LEVEL MAP)
  // ============================================================
  function buildMap() {
    $("map-stars").textContent = state.totalStars;
    var trail = $("path-trail");
    trail.innerHTML = "";
    for (var lv = 1; lv <= MAX_LEVEL; lv++) {
      var unlocked = lv <= state.maxUnlocked;
      var node = el("div", "path-node" + (unlocked ? "" : " locked") + (lv === state.maxUnlocked ? " current" : ""));

      var emoji = el("div", "path-emoji"); emoji.textContent = PATH_ICONS[lv - 1];
      node.appendChild(emoji);

      var label = el("div", "path-label"); label.textContent = LEVELS[lv - 1].label;
      node.appendChild(label);

      var starsWrap = el("div", "path-stars");
      var earned = state.stars[lv] || 0;
      for (var i = 0; i < 3; i++) {
        var st = el("span", i < earned ? "on" : "off"); st.textContent = "★";
        starsWrap.appendChild(st);
      }
      node.appendChild(starsWrap);

      if (!unlocked) { var lock = el("div", "path-lock"); lock.textContent = "🔒"; node.appendChild(lock); }

      if (unlocked) {
        node.addEventListener("click", (function (level) {
          return function () { sfx.tap(); startLevel(level); };
        })(lv));
      }
      trail.appendChild(node);
    }
  }

  // ============================================================
  //  QUESTION ENGINE
  // ============================================================
  var mission = null; // { level, cfg, progress, misses, combo, current, buffer, locked }

  function newQuestion() {
    var cfg = mission.cfg;
    var pair = cfg.gen();
    var sum = pair.a + pair.b;
    var themeIdx = randInt(0, THEME_A.length - 1);
    mission.current = { a: pair.a, b: pair.b, sum: sum, options: generateOptions(sum), buffer: "" };
    mission.locked = false;

    if (cfg.icons) {
      $("icon-question").classList.add("active");
      $("digit-question").classList.remove("active");
      renderIconGroup("icon-group-a", pair.a, THEME_A[themeIdx]);
      renderIconGroup("icon-group-b", pair.b, THEME_B[themeIdx]);
    } else {
      $("icon-question").classList.remove("active");
      $("digit-question").classList.add("active");
      $("eq-a").textContent = pair.a;
      $("eq-b").textContent = pair.b;
    }
    renderBoxes();
  }

  // Nearby-value distractors so guessing requires real precision.
  function generateOptions(sum) {
    var opts = [sum], guard = 0;
    while (opts.length < 4 && guard++ < 400) {
      var delta = randInt(1, 6) * (Math.random() < 0.5 ? -1 : 1);
      var cand = sum + delta;
      if (cand < 0) cand = sum + Math.abs(delta);
      if (cand >= 0 && opts.indexOf(cand) === -1) opts.push(cand);
    }
    var n = 1;
    while (opts.length < 4 && n < 100) {
      var f = sum + n; if (f < 0) f = sum - n;
      if (f >= 0 && opts.indexOf(f) === -1) opts.push(f);
      n++;
    }
    return shuffle(opts);
  }

  function renderIconGroup(containerId, count, theme) {
    var wrap = $(containerId);
    wrap.innerHTML = "";
    for (var i = 0; i < count; i++) {
      var o = el("div", "count-obj");
      o.textContent = theme;
      (function (idx, node) {
        node.addEventListener("click", function () {
          if (mission.locked) return;
          node.classList.remove("boing"); void node.offsetWidth; node.classList.add("boing");
          sfx.boop(idx % 8);
        });
      })(i, o);
      wrap.appendChild(o);
    }
  }

  function renderBoxes() {
    var wrap = $("answer-boxes");
    wrap.classList.remove("locked");
    wrap.innerHTML = "";
    mission.current.options.forEach(function (val) {
      var box = el("button", "answer-box");
      box.textContent = val;
      box.setAttribute("data-val", val);
      box.addEventListener("click", function () { pick(val, box); });
      wrap.appendChild(box);
    });
  }

  function boxByVal(val) {
    var boxes = $("answer-boxes").querySelectorAll(".answer-box");
    for (var i = 0; i < boxes.length; i++) {
      if (parseInt(boxes[i].getAttribute("data-val"), 10) === val) return boxes[i];
    }
    return null;
  }

  // ============================================================
  //  MISSION / GAMEPLAY
  // ============================================================
  function startLevel(level) {
    mission = { level: level, cfg: LEVELS[level - 1], progress: 0, misses: 0, combo: 0, current: null };
    $("mission-stars").textContent = state.totalStars;
    buildProgressDots();
    showScreen("mission");
    audio(); // unlock audio on the click that got us here
    newQuestion();
  }

  function buildProgressDots() {
    var wrap = $("progress-dots");
    wrap.innerHTML = "";
    for (var i = 0; i < STEPS_TO_STOP; i++) wrap.appendChild(el("div", "dot"));
    wrap.appendChild(el("div", "dot goal"));
  }
  function refreshProgressDots() {
    var dots = $("progress-dots").querySelectorAll(".dot");
    for (var i = 0; i < dots.length; i++) {
      if (!dots[i].classList.contains("goal")) dots[i].classList.toggle("done", i < mission.progress);
    }
  }

  function pick(val, box) {
    if (mission.locked) return;
    if (val === mission.current.sum) onCorrect(box); else onWrong(box);
  }

  function onCorrect(box) {
    mission.locked = true;
    $("answer-boxes").classList.add("locked");
    box.classList.add("correct");
    $("answer-boxes").querySelectorAll(".answer-box").forEach(function (b) { if (b !== box) b.classList.add("dim"); });

    mission.combo++;
    mission.progress++;
    state.totalStars++;
    [$("mission-stars"), $("map-stars")].forEach(function (c) { if (c) c.textContent = state.totalStars; });
    var counter = $("mission-stars").parentElement;
    counter.classList.remove("star-bump"); void counter.offsetWidth; counter.classList.add("star-bump");

    sfx.correct(mission.combo);
    showCombo(mission.combo);
    burstConfetti(false);
    refreshProgressDots();
    save();

    setTimeout(function () {
      if (mission.progress >= STEPS_TO_STOP) finishLevel();
      else newQuestion();
    }, 800);
  }

  function onWrong(box) {
    mission.locked = true;
    $("answer-boxes").classList.add("locked");
    box.classList.add("wrong");
    mission.misses++;
    mission.combo = 0;
    sfx.wrong();
    save();

    if (mission.cfg.icons) {
      autoCount(function () { unlockInput(box); });
    } else {
      setTimeout(function () { unlockInput(box); }, 700);
    }
  }

  function unlockInput(box) {
    box.classList.remove("wrong");
    $("answer-boxes").classList.remove("locked");
    mission.locked = false;
    mission.current.buffer = "";
  }

  // Bounce each icon in sequence (group A then group B) so a young child
  // can re-count both groups after a miss, reinforcing the total.
  function autoCount(done) {
    var groups = [$("icon-group-a").querySelectorAll(".count-obj"), $("icon-group-b").querySelectorAll(".count-obj")];
    var flat = [];
    groups.forEach(function (g) { for (var i = 0; i < g.length; i++) flat.push(g[i]); });
    var i = 0;
    function step() {
      if (i >= flat.length) { setTimeout(done, 300); return; }
      var o = flat[i];
      o.classList.remove("boing"); void o.offsetWidth; o.classList.add("boing");
      sfx.boop(i % 8);
      i++;
      setTimeout(step, 360);
    }
    setTimeout(step, 250);
  }

  function showCombo(combo) {
    if (combo < 2) return;
    var badge = $("combo-badge");
    badge.textContent = "🔥" + combo;
    badge.classList.remove("show"); void badge.offsetWidth; badge.classList.add("show");
  }

  function finishLevel() {
    var level = mission.level;
    var stars = mission.misses === 0 ? 3 : (mission.misses <= 2 ? 2 : 1);
    var prevStars = state.stars[level] || 0;
    if (stars > prevStars) state.stars[level] = stars;

    var newlyUnlocked = false;
    if (level === state.maxUnlocked && level < MAX_LEVEL) { state.maxUnlocked = level + 1; newlyUnlocked = true; }
    if (state.critters.indexOf(level) === -1) state.critters.push(level);

    save();
    showReward(stars, level, newlyUnlocked);
  }

  // ============================================================
  //  REWARD SCREEN
  // ============================================================
  function showReward(stars, level, newlyUnlocked) {
    showScreen("reward");
    var starEls = $("reward-stars").querySelectorAll(".rstar");
    starEls.forEach(function (s) { s.classList.remove("on"); });
    for (var i = 0; i < stars; i++) {
      (function (idx) { setTimeout(function () { starEls[idx].classList.add("on"); sfx.star(); }, idx * 300); })(i);
    }
    $("reward-critter").textContent = CRITTERS[level - 1];
    sfx.fanfare();
    burstConfetti(true);

    $("btn-reward-next").onclick = function () {
      sfx.tap();
      if (newlyUnlocked) startLevel(level + 1);
      else { buildMap(); showScreen("map"); }
    };
  }

  // ============================================================
  //  BUG BOOK (COLLECTION)
  // ============================================================
  function buildBook() {
    $("book-stars").textContent = state.totalStars;
    var grid = $("critter-grid");
    grid.innerHTML = "";
    CRITTERS.forEach(function (c, i) {
      var owned = state.critters.indexOf(i + 1) !== -1;
      var cell = el("div", "critter-cell" + (owned ? " owned" : " empty"));
      cell.textContent = owned ? c : "❔";
      grid.appendChild(cell);
    });
  }

  // ============================================================
  //  INPUT (keyboard typing, mirrors click behaviour)
  // ============================================================
  document.addEventListener("keydown", function (e) {
    if (!screens.mission.classList.contains("active")) return;
    if (mission == null || mission.locked || mission.current == null) return;

    if (e.key >= "0" && e.key <= "9") {
      if (mission.current.buffer.length < 3) mission.current.buffer += e.key;
      sfx.tap();
      evalBuffer();
      e.preventDefault();
    } else if (e.key === "Backspace") {
      mission.current.buffer = mission.current.buffer.slice(0, -1); highlightTyping(); e.preventDefault();
    } else if (e.key === "Enter") {
      submitBuffer(); e.preventDefault();
    }
  });

  function evalBuffer() {
    var q = mission.current;
    if (q.buffer === "") { highlightTyping(); return; }
    var val = parseInt(q.buffer, 10);
    var exact = q.options.indexOf(val) !== -1;
    var prefixPossible = q.options.some(function (o) {
      var s = "" + o; return s.indexOf(q.buffer) === 0 && s.length > q.buffer.length;
    });
    if (exact && !prefixPossible) { submitBuffer(); return; }
    if (!exact && !prefixPossible) { q.buffer = ""; }
    highlightTyping();
  }

  function highlightTyping() {
    var q = mission.current;
    var val = q.buffer === "" ? NaN : parseInt(q.buffer, 10);
    $("answer-boxes").querySelectorAll(".answer-box").forEach(function (b) {
      var bv = parseInt(b.getAttribute("data-val"), 10);
      b.classList.toggle("typing-match", !isNaN(val) && bv === val);
    });
  }

  function submitBuffer() {
    var q = mission.current;
    if (q.buffer === "") return;
    var val = parseInt(q.buffer, 10);
    var box = boxByVal(val);
    if (box) pick(val, box);
    else { q.buffer = ""; highlightTyping(); }
  }

  // ============================================================
  //  BUTTON WIRING
  // ============================================================
  $("btn-book").addEventListener("click", function () { sfx.tap(); buildBook(); showScreen("book"); });
  $("btn-book-back").addEventListener("click", function () { sfx.tap(); buildMap(); showScreen("map"); });
  $("btn-back").addEventListener("click", function () { sfx.tap(); mission = null; buildMap(); showScreen("map"); });
  $("btn-reward-home").addEventListener("click", function () { sfx.tap(); buildMap(); showScreen("map"); });

  var muteBtn = $("btn-mute");
  function refreshMute() { muteBtn.textContent = state.muted ? "🔇" : "🔊"; }
  muteBtn.addEventListener("click", function () { state.muted = !state.muted; refreshMute(); save(); if (!state.muted) sfx.tap(); });
  refreshMute();

  // -------------------- Hidden reset (long-press 2s) --------------------
  (function () {
    var timer = null, zone = $("reset-zone");
    function start() { timer = setTimeout(function () { state = defaultState(); save(); buildMap(); sfx.fanfare(); }, 2000); }
    function cancel() { if (timer) { clearTimeout(timer); timer = null; } }
    zone.addEventListener("mousedown", start);
    zone.addEventListener("mouseup", cancel);
    zone.addEventListener("mouseleave", cancel);
    zone.addEventListener("touchstart", start, { passive: true });
    zone.addEventListener("touchend", cancel);
  })();

  // -------------------- Resize handling --------------------
  window.addEventListener("resize", function () { resizeBg(); resizeConfetti(); });

  // ============================================================
  //  BOOT
  // ============================================================
  resizeBg(); resizeConfetti(); drawBg();
  buildMap();
  showScreen("map");

})();
