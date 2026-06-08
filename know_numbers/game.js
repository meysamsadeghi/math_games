/* ============================================================
   Count With Me — number-learning game (ages ~4)
   Count the objects, pick the matching number box (click or type).
   Wordless: digits, shapes/emoji, and icons only. Fun sounds, no voice.
   Plain script (no modules) so it runs from file:// by double-click.
   ============================================================ */
(function () {
  "use strict";

  // -------------------- Config --------------------
  // Difficulty is a sticky LEVEL the grown-up picks; it never changes on its own.
  // Each level is a band of counts the questions are drawn from. Tap the level
  // pill to cycle; it's saved and stays put until changed. Trim/extend this list
  // to taste.
  var LEVELS = [
    { min: 1,  max: 10, label: "1–10" },
    { min: 10, max: 20, label: "10–20" },
    { min: 20, max: 30, label: "20–30" },
    { min: 30, max: 40, label: "30–40" },
    { min: 40, max: 50, label: "40–50" }
  ];
  var FRIEND_EVERY = 5;             // correct answers per new collectible friend
  var NUM_BOXES = 4;
  var SAVE_KEY = "countWithMe.v1";

  // Object themes (rotate each question). Each is a single emoji repeated N times.
  var THEMES = ["🦄","⭐","🎈","🦆","🍎","🌸","🐠","🦋","🧁","🐥","🌈","🍓","🐸","🚗","🌟"];

  // Collectible "friends" (cute creatures), unlocked as the child plays.
  var FRIENDS = ["🐶","🐱","🐰","🐼","🦊","🐯","🦁","🐮","🐷","🐨","🐵","🐧","🐢","🦉","🦖","🦕"];

  // -------------------- State --------------------
  function defaultState() {
    return {
      level: 0,                // sticky difficulty band (index into LEVELS)
      stars: 0,
      friends: [],             // indices into FRIENDS that are owned
      friendProgress: 0,       // correct answers toward the next friend
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

  function band() { return LEVELS[Math.min(state.level, LEVELS.length - 1)]; }

  // -------------------- DOM helpers --------------------
  function $(id) { return document.getElementById(id); }
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = randInt(0, i); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  var screens = { play: $("screen-play"), book: $("screen-book") };
  function showScreen(name) { for (var k in screens) screens[k].classList.toggle("active", k === name); }

  // ============================================================
  //  AUDIO (Web Audio API, synthesized — fun sounds, no speech)
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
    // ascending boop for counting; step 0..n
    boop: function (step) { tone(440 + step * 70, 0.12, "sine", 0.22); },
    correct: function () { tone(660, 0.12, "sine", 0.25); setTimeout(function(){ tone(990, 0.16, "sine", 0.22); }, 100); },
    wrong: function () { tone(300, 0.3, "sine", 0.16, 180); },
    star: function () { tone(1200, 0.08, "square", 0.14); setTimeout(function(){ tone(1700, 0.1, "square", 0.12); }, 70); },
    fanfare: function () { [523,659,784,1046,1318].forEach(function (f, i) { setTimeout(function(){ tone(f, 0.22, "triangle", 0.22); }, i * 120); }); }
  };

  // ============================================================
  //  SOFT STARRY BACKGROUND
  // ============================================================
  var bg = $("stars-bg"), bgx = bg.getContext("2d"), bgStars = [];
  function resizeBg() {
    bg.width = window.innerWidth; bg.height = window.innerHeight;
    bgStars = [];
    var count = Math.round((bg.width * bg.height) / 7000);
    for (var i = 0; i < count; i++) {
      bgStars.push({ x: Math.random()*bg.width, y: Math.random()*bg.height,
        r: Math.random()*1.6+0.4, tw: Math.random()*Math.PI*2, sp: Math.random()*0.03+0.01 });
    }
  }
  function drawBg() {
    var grad = bgx.createLinearGradient(0, 0, 0, bg.height);
    grad.addColorStop(0, "#2a1e5c"); grad.addColorStop(1, "#4b2e83");
    bgx.fillStyle = grad; bgx.fillRect(0, 0, bg.width, bg.height);
    for (var i = 0; i < bgStars.length; i++) {
      var s = bgStars[i]; s.tw += s.sp;
      bgx.globalAlpha = 0.5 + Math.sin(s.tw) * 0.5;
      bgx.fillStyle = "#fff";
      bgx.beginPath(); bgx.arc(s.x, s.y, s.r, 0, Math.PI*2); bgx.fill();
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
    var colors = ["#ffd23f","#3ddc84","#5ad1ff","#ff6b6b","#ff8fc8","#b388ff"];
    var n = big ? 160 : 90;
    for (var i = 0; i < n; i++) {
      pieces.push({ x: Math.random()*confetti.width, y: -Math.random()*confetti.height*0.5,
        vx: Math.random()*2-1, vy: Math.random()*3+2, size: Math.random()*8+4,
        rot: Math.random()*Math.PI, vr: Math.random()*0.2-0.1, life: 1,
        color: colors[Math.floor(Math.random()*colors.length)] });
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
      cfx.fillRect(-p.size/2, -p.size/2, p.size, p.size*0.6);
      cfx.restore();
    }
    cfx.globalAlpha = 1;
    if (pieces.length) confettiId = requestAnimationFrame(confettiFrame);
    else { cancelAnimationFrame(confettiId); confettiId = null; }
  }

  // ============================================================
  //  QUESTION ENGINE
  // ============================================================
  var q = null; // { count, theme, options:[], buffer, locked }

  function newQuestion() {
    var b = band();
    var lo = b.min, hi = b.max;
    var count = randInt(lo, hi);
    var theme = THEMES[randInt(0, THEMES.length - 1)];

    // distractors: unique numbers near `count`, kept inside the level band
    var opts = [count];
    var guard = 0;
    while (opts.length < NUM_BOXES && guard++ < 300) {
      var delta = randInt(1, 3) * (Math.random() < 0.5 ? -1 : 1);
      var cand = count + delta;
      if (cand < lo) cand = count + Math.abs(delta);
      if (cand > hi) cand = count - Math.abs(delta);
      if (cand >= lo && cand <= hi && opts.indexOf(cand) === -1) opts.push(cand);
    }
    // fallback fill across the band if near-numbers ran out
    var span = hi - lo + 1, n = 1;
    while (opts.length < NUM_BOXES && span >= NUM_BOXES) {
      var f = lo + (((count - lo) + n) % span);
      if (opts.indexOf(f) === -1) opts.push(f);
      n++;
      if (n > span + NUM_BOXES) break;
    }
    shuffle(opts);

    q = { count: count, theme: theme, options: opts, buffer: "", locked: false };
    renderObjects();
    renderBoxes();
  }

  function renderObjects() {
    var tray = $("object-tray");
    tray.innerHTML = "";
    // shrink objects when there are many so they all fit and stay countable
    var size = q.count <= 8  ? "clamp(46px, 8vw, 84px)"
             : q.count <= 16 ? "56px"
             : q.count <= 25 ? "44px"
             : q.count <= 35 ? "36px" : "30px";
    for (var i = 0; i < q.count; i++) {
      var o = el("div", "count-obj");
      o.textContent = q.theme;
      o.style.fontSize = size;
      o.setAttribute("data-i", i);
      (function (idx, node) {
        node.addEventListener("click", function () {
          if (q.locked) return;
          node.classList.remove("boing"); void node.offsetWidth; node.classList.add("boing");
          sfx.boop(idx % 8);
        });
      })(i, o);
      tray.appendChild(o);
    }
  }

  function renderBoxes() {
    var wrap = $("answer-boxes");
    wrap.classList.remove("locked");
    wrap.innerHTML = "";
    q.options.forEach(function (val) {
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

  function pick(val, box) {
    if (q.locked) return;
    if (val === q.count) onCorrect(box);
    else onWrong(box);
  }

  function onCorrect(box) {
    q.locked = true;
    $("answer-boxes").classList.add("locked");
    box.classList.add("correct");
    // dim the others
    $("answer-boxes").querySelectorAll(".answer-box").forEach(function (b) {
      if (b !== box) b.classList.add("dim");
    });
    // objects celebrate
    $("object-tray").querySelectorAll(".count-obj").forEach(function (o, i) {
      setTimeout(function () { o.classList.add("celebrate"); }, i * 40);
    });
    sfx.correct(); sfx.star();
    burstConfetti(false);

    // reward bookkeeping (difficulty is fixed by the chosen level; never auto-changes)
    addStar();
    state.friendProgress++;

    var gotFriend = false;
    if (state.friendProgress >= FRIEND_EVERY) { state.friendProgress = 0; gotFriend = unlockFriend(); }
    updateFriendMeter();
    save();

    setTimeout(function () {
      if (gotFriend) { showFriendPopup(); return; } // popup advances to next question
      newQuestion();
    }, 900);
  }

  function onWrong(box) {
    q.locked = true;
    $("answer-boxes").classList.add("locked");
    box.classList.add("wrong");
    sfx.wrong();
    // teach: auto-count the objects one by one
    autoCount(function () {
      box.classList.remove("wrong");
      $("answer-boxes").classList.remove("locked");
      q.locked = false;
      q.buffer = "";
    });
  }

  // Bounce each object in sequence with a rising boop (one-to-one counting)
  function autoCount(done) {
    var objs = $("object-tray").querySelectorAll(".count-obj");
    var i = 0;
    function step() {
      if (i >= objs.length) { setTimeout(done, 300); return; }
      var o = objs[i];
      o.classList.remove("boing"); void o.offsetWidth; o.classList.add("boing");
      sfx.boop(i % 8);
      i++;
      setTimeout(step, 380);
    }
    setTimeout(step, 250);
  }

  // ============================================================
  //  REWARDS
  // ============================================================
  function addStar() {
    state.stars++;
    [$("star-count"), $("book-star-count")].forEach(function (c) { if (c) c.textContent = state.stars; });
    var sc = $("star-count");
    if (sc) { sc.parentElement.classList.remove("star-bump"); void sc.parentElement.offsetWidth; sc.parentElement.classList.add("star-bump"); }
  }

  function updateLevelLabel() {
    var lbl = $("level-label");
    if (lbl) lbl.textContent = band().label;
  }

  function updateFriendMeter() {
    $("friend-fill").style.width = Math.round((state.friendProgress / FRIEND_EVERY) * 100) + "%";
    // preview the next friend to be earned
    var next = nextFriendIndex();
    $("next-friend").textContent = next === -1 ? "🏆" : "🎁";
  }

  function nextFriendIndex() {
    for (var i = 0; i < FRIENDS.length; i++) { if (state.friends.indexOf(i) === -1) return i; }
    return -1;
  }

  function unlockFriend() {
    var idx = nextFriendIndex();
    if (idx === -1) return false;
    state.friends.push(idx);
    return true;
  }

  function showFriendPopup() {
    var idx = state.friends[state.friends.length - 1];
    $("popup-friend").textContent = FRIENDS[idx];
    $("friend-popup").classList.add("show");
    sfx.fanfare();
    burstConfetti(true);
    // dismiss on click/key, then continue
    var dismiss = function () {
      $("friend-popup").classList.remove("show");
      document.removeEventListener("click", dismiss);
      document.removeEventListener("keydown", dismiss);
      newQuestion();
    };
    setTimeout(function () {
      document.addEventListener("click", dismiss);
      document.addEventListener("keydown", dismiss);
    }, 400);
    // auto-continue after a while if untouched
    setTimeout(function () { if ($("friend-popup").classList.contains("show")) dismiss(); }, 3500);
  }

  // ============================================================
  //  COLLECTION / STICKER BOOK
  // ============================================================
  function buildBook() {
    $("book-star-count").textContent = state.stars;
    var grid = $("friend-grid");
    grid.innerHTML = "";
    FRIENDS.forEach(function (f, i) {
      var owned = state.friends.indexOf(i) !== -1;
      var cell = el("div", "friend-cell" + (owned ? " owned" : " empty"));
      cell.textContent = owned ? f : "❔";
      grid.appendChild(cell);
    });
  }

  // ============================================================
  //  INPUT (keyboard typing)
  // ============================================================
  document.addEventListener("keydown", function (e) {
    if (!screens.play.classList.contains("active")) return;
    if (q == null || q.locked) return;

    if (e.key >= "0" && e.key <= "9") {
      if (q.buffer.length < 2) { q.buffer += e.key; }
      sfx.tap();
      evalBuffer();
      e.preventDefault();
    } else if (e.key === "Backspace") {
      q.buffer = q.buffer.slice(0, -1); highlightTyping(); e.preventDefault();
    } else if (e.key === "Enter") {
      submitBuffer(); e.preventDefault();
    }
  });

  // After each digit: if buffer exactly matches an option, auto-submit;
  // otherwise highlight a matching box and clear if it can't lead anywhere.
  function evalBuffer() {
    if (q.buffer === "") { highlightTyping(); return; }
    var val = parseInt(q.buffer, 10);
    var exact = q.options.indexOf(val) !== -1;
    // could a longer number still match a two-digit option starting with this?
    var prefixPossible = q.options.some(function (o) {
      var s = "" + o; return s.indexOf(q.buffer) === 0 && s.length > q.buffer.length;
    });
    // submit only when it's an exact match AND no longer option could still match
    if (exact && !prefixPossible) { submitBuffer(); return; }
    // dead end (wrong digit, no exact and no possible continuation) -> soft reset
    if (!exact && !prefixPossible) { q.buffer = ""; }
    highlightTyping();
  }

  function highlightTyping() {
    var val = q.buffer === "" ? NaN : parseInt(q.buffer, 10);
    $("answer-boxes").querySelectorAll(".answer-box").forEach(function (b) {
      var bv = parseInt(b.getAttribute("data-val"), 10);
      b.classList.toggle("typing-match", !isNaN(val) && bv === val);
    });
  }

  function submitBuffer() {
    if (q.buffer === "") return;
    var val = parseInt(q.buffer, 10);
    var box = boxByVal(val);
    if (box) pick(val, box);
    else { q.buffer = ""; highlightTyping(); }
  }

  // ============================================================
  //  BUTTON WIRING
  // ============================================================
  // Level pill: tap to cycle the sticky difficulty band (grown-up control).
  $("btn-level").addEventListener("click", function () {
    state.level = (state.level + 1) % LEVELS.length;
    save();
    updateLevelLabel();
    sfx.star();
    newQuestion();
  });

  $("btn-book").addEventListener("click", function () { sfx.tap(); buildBook(); showScreen("book"); });
  $("btn-book-back").addEventListener("click", function () { sfx.tap(); showScreen("play"); });

  var muteBtn = $("btn-mute");
  function refreshMute() { muteBtn.textContent = state.muted ? "🔇" : "🔊"; }
  muteBtn.addEventListener("click", function () { state.muted = !state.muted; refreshMute(); save(); if (!state.muted) sfx.tap(); });
  refreshMute();

  // Hidden long-press reset (2s)
  (function () {
    var timer = null, zone = $("reset-zone");
    function start() { timer = setTimeout(function () { state = defaultState(); save(); refreshAll(); newQuestion(); sfx.fanfare(); }, 2000); }
    function cancel() { if (timer) { clearTimeout(timer); timer = null; } }
    zone.addEventListener("mousedown", start);
    zone.addEventListener("mouseup", cancel);
    zone.addEventListener("mouseleave", cancel);
    zone.addEventListener("touchstart", start, { passive: true });
    zone.addEventListener("touchend", cancel);
  })();

  function refreshAll() {
    $("star-count").textContent = state.stars;
    $("book-star-count").textContent = state.stars;
    updateLevelLabel();
    updateFriendMeter();
    refreshMute();
  }

  // Resize handling
  window.addEventListener("resize", function () { resizeBg(); resizeConfetti(); });

  // ============================================================
  //  BOOT
  // ============================================================
  resizeBg(); resizeConfetti(); drawBg();
  refreshAll();
  newQuestion();
  showScreen("play");

})();
