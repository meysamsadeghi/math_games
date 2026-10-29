/* ============================================================
   Percent Potion Lab — game logic
   Ten progressive levels that build the idea of percent from the
   ground up: reading a 100-square grid, painting percents, benchmark
   fills (25/50/75/100), percent of a small group, fractions as
   percents, percent of a number, and finally sale prices (ages ~8-12).
   Each level opens with a short lesson card, and a miss replays a
   counting animation or a worked hint. Plain script (no modules) so it
   runs from file:// by double-click.
   ============================================================ */
(function () {
  "use strict";

  // -------------------- Config --------------------
  var STEPS_TO_STOP = 6;     // correct answers needed to finish a level
  var SAVE_KEY = "percentPotionLab.v1";

  function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = randInt(0, i); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function pickOne(a) { return a[randInt(0, a.length - 1)]; }

  // Lab shelf stop per level, and the potion pet unlocked on completion.
  var PATH_ICONS = ["🧪", "🔬", "🖌️", "🍶", "🍎", "🍕", "🥧", "🔍", "🧠", "🏷️"];
  var CRITTERS   = ["🐸", "🐙", "🦊", "🐢", "🦄", "🐝", "🦉", "🐳", "🦚", "🐉"];
  var ITEM_EMOJI = ["🍎", "🐟", "⭐", "🎈", "🍓", "🌸", "🐞", "🍩"];

  // -------------------- DOM helpers --------------------
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function fmt(v, unit) { return unit === "%" ? v + "%" : unit === "$" ? "$" + v : "" + v; }

  // Answer plus three distractors. Preferred candidates (usually common
  // misconceptions) are tried first, then nearby values `step` apart.
  function buildOptions(answer, candidates, step, min, max) {
    var out = [answer];
    function tryAdd(c) {
      if (out.length >= 4) return;
      if (c !== Math.round(c) || c < min || c > max || out.indexOf(c) !== -1) return;
      out.push(c);
    }
    shuffle(candidates.slice()).forEach(tryAdd);
    for (var d = 1; out.length < 4 && d < 200; d++) { tryAdd(answer + d * step); tryAdd(answer - d * step); }
    return shuffle(out);
  }

  // ============================================================
  //  VISUAL BUILDERS
  // ============================================================

  // 10x10 hundred-square; the first `filled` cells (reading order) are colored.
  function makeGrid(filled) {
    var g = el("div", "hgrid");
    for (var i = 0; i < 100; i++) {
      var c = el("div", "cell" + (i < filled ? " on" : ""));
      c.setAttribute("data-i", i);
      g.appendChild(c);
    }
    return g;
  }
  function setGridFill(g, filled) {
    var cells = g.children;
    for (var i = 0; i < cells.length; i++) cells[i].classList.toggle("on", i < filled);
  }

  function makeBottle(pct) {
    var wrap = el("div", "bottle-wrap");
    wrap.appendChild(el("div", "bottle-neck"));
    var b = el("div", "bottle");
    var liquid = el("div", "liquid"); liquid.style.height = pct + "%";
    b.appendChild(liquid);
    [25, 50, 75].forEach(function (t) { var tick = el("div", "tick"); tick.style.bottom = t + "%"; b.appendChild(tick); });
    wrap.appendChild(b);
    return wrap;
  }

  function makePie(pct) {
    var p = el("div", "pie");
    p.style.background = "conic-gradient(var(--potion) 0 " + pct + "%, var(--empty) " + pct + "% 100%)";
    return p;
  }

  // `lit` of `total` items glow, the rest are greyed out. Positions are
  // mixed up unless `ordered`, so the child has to really count.
  function makeItems(total, lit, emoji, ordered) {
    var flags = [];
    for (var i = 0; i < total; i++) flags.push(i < lit);
    if (!ordered) shuffle(flags);
    var w = el("div", "items" + (total > 10 ? " many" : ""));
    w.style.gridTemplateColumns = "repeat(" + (total <= 5 ? total : 5) + ", auto)";
    flags.forEach(function (on) { w.appendChild(el("span", "item" + (on ? " lit" : ""), emoji)); });
    return w;
  }

  function makeFraction(num, den) {
    var f = el("div", "fraction");
    f.appendChild(el("span", "fnum", num));
    f.appendChild(el("span", "fden", den));
    return f;
  }
  function makeFractionBar(num, den) {
    var bar = el("div", "fbar");
    for (var i = 0; i < den; i++) bar.appendChild(el("div", "fseg" + (i < num ? " on" : "")));
    return bar;
  }

  // A bar standing for the whole, cut into equal parts that suit the
  // percent (halves, quarters or tenths). The asked-for share is colored;
  // with `sale`, the share is instead the part cut off the price.
  function makeNumberBar(wholeLabel, pct, sale) {
    var parts = pct === 100 ? 1 : pct === 50 ? 2 : pct % 25 === 0 ? 4 : 10;
    var share = pct * parts / 100;
    var wrap = el("div", "nbar-wrap");
    wrap.appendChild(el("div", "nbar-whole", wholeLabel));
    var bar = el("div", "nbar");
    for (var i = 0; i < parts; i++) {
      var cls = sale ? (i < parts - share ? " on" : " off") : (i < share ? " on" : "");
      bar.appendChild(el("div", "nseg" + cls));
    }
    wrap.appendChild(bar);
    return wrap;
  }

  // Big equation line; "?" becomes the dashed answer slot.
  function makeEquation(parts) {
    var eq = el("div", "equation");
    parts.forEach(function (p) {
      eq.appendChild(el("span", p === "?" ? "eq-huh" : (p === "of" || p === "−" || p === "=") ? "eq-op" : "eq-num", p));
    });
    return eq;
  }

  function caption(text) { return el("div", "lesson-cap", text); }

  // -------------------- Counting animations (after a miss) --------------------
  function gridSteps(stage) {
    var on = stage.querySelectorAll(".cell.on"), steps = [], n = on.length, full = Math.floor(n / 10);
    for (var r = 0; r < full; r++) {
      steps.push({ els: Array.prototype.slice.call(on, r * 10, r * 10 + 10), text: "Row " + (r + 1) + " → " + (r + 1) * 10 + "%", delay: 480 });
    }
    for (var j = full * 10; j < n; j++) steps.push({ els: [on[j]], text: "+1 box → " + (j + 1) + "%", delay: 260 });
    return steps;
  }
  function partSteps(stage, selector, each) {
    var on = stage.querySelectorAll(selector), steps = [];
    for (var i = 0; i < on.length; i++) steps.push({ els: [on[i]], text: "Each is " + each + "% → " + (i + 1) * each + "%", delay: 520 });
    return steps;
  }

  // ============================================================
  //  LEVELS
  //  Each has a map label, a lesson card and a generator returning one
  //  question: { prompt, answer, unit, options, render(stage), hint,
  //  count(stage)?, mode? }. `count` replays a counting animation on a
  //  miss; otherwise `hint` shows a worked method (without the answer).
  // ============================================================
  var LEVELS = [
    { label: "10s", title: "What is a percent?",
      lesson: {
        text: "<b>Percent</b> means <b>“out of 100”</b>.<br>This square has <b>100</b> little boxes — the whole square is <b>100%</b>.<br>Every row has 10 boxes, so <b>one row = 10%</b>.",
        visual: function (v) { v.appendChild(makeGrid(30)); v.appendChild(caption("3 rows = 30%")); }
      },
      gen: function () {
        var k = randInt(1, 9), ans = k * 10;
        return { prompt: "How much of the square is colored?", answer: ans, unit: "%",
          options: buildOptions(ans, [ans - 10, ans + 10, ans + 20, k], 10, 0, 100),
          render: function (s) { s.appendChild(makeGrid(ans)); },
          count: gridSteps };
      } },

    { label: "1%", title: "Every box is 1%",
      lesson: {
        text: "100 boxes make 100%, so <b>each little box is 1%</b>.<br>Count the full rows by tens, then add the extra boxes one by one.",
        visual: function (v) { v.appendChild(makeGrid(34)); v.appendChild(caption("3 rows + 4 boxes = 34%")); }
      },
      gen: function () {
        var n; do { n = randInt(11, 99); } while (n % 10 === 0);
        var swapped = (n % 10) * 10 + Math.floor(n / 10);
        return { prompt: "How much of the square is colored?", answer: n, unit: "%",
          options: buildOptions(n, [n + 10, n - 10, n + 1, n - 1, swapped], 1, 1, 100),
          render: function (s) { s.appendChild(makeGrid(n)); },
          count: gridSteps };
      } },

    { label: "Paint", title: "Paint a percent",
      lesson: {
        text: "Now <b>you</b> make the percent!<br>Tap a box to fill up to it, or drag to paint fast. Tap the last box again to remove it.<br>Press <b>✔</b> when you're done.",
        visual: function (v) { v.appendChild(makeGrid(25)); v.appendChild(caption("Painted 25%")); }
      },
      gen: function () {
        var target = Math.random() < 0.4 ? randInt(1, 9) * 10 : randInt(5, 95);
        return { mode: "paint", prompt: "Paint " + target + "% of the square!", answer: target, unit: "%",
          render: function (s) { s.appendChild(makeGrid(0)); } };
      } },

    { label: "½ ¼", title: "Half, quarter, whole",
      lesson: {
        text: "Some percents are worth knowing by heart:<br><b>Full = 100%</b> · <b>Half = 50%</b> · <b>Half of a half = 25%</b> · <b>Three quarters = 75%</b>",
        visual: function (v) {
          var row = el("div", "lesson-row");
          [25, 50, 100].forEach(function (p) {
            var col = el("div", "lesson-col"); col.appendChild(makeBottle(p)); col.appendChild(caption(p + "%")); row.appendChild(col);
          });
          v.appendChild(row);
        }
      },
      gen: function () {
        var pct = pickOne([25, 50, 75, 100]);
        var hints = { 25: "Look at the lines: it's half of a half.", 50: "It's filled exactly to the middle — half.",
          75: "Half and then a quarter more.", 100: "Filled all the way to the top!" };
        var usePie = Math.random() < 0.5;
        return { prompt: usePie ? "How much of the pie is colored?" : "How full is the potion bottle?", answer: pct, unit: "%",
          options: shuffle([25, 50, 75, 100]),
          render: function (s) { s.appendChild(usePie ? makePie(pct) : makeBottle(pct)); },
          hint: hints[pct] };
      } },

    { label: "of 10", title: "Percent of 10 things",
      lesson: {
        text: "Percent works for groups too. The whole group is 100%.<br>With <b>10 things</b>, each one is <b>100% ÷ 10 = 10%</b>.",
        visual: function (v) { v.appendChild(makeItems(10, 3, "🍎", true)); v.appendChild(caption("3 of 10 = 30%")); }
      },
      gen: function () {
        var k = randInt(1, 9), ans = k * 10, emoji = pickOne(ITEM_EMOJI);
        return { prompt: "What percent of the " + emoji + " are glowing?", answer: ans, unit: "%",
          options: buildOptions(ans, [k, ans + 10, ans - 10, 100 - ans], 10, 0, 100),
          render: function (s) { s.appendChild(makeItems(10, k, emoji)); },
          count: function (s) { return partSteps(s, ".item.lit", 10); } };
      } },

    { label: "Share", title: "Sharing 100%",
      lesson: {
        text: "Split 100% into equal shares:<br><b>2 things</b> → 50% each · <b>4 things</b> → 25% each<br><b>5 things</b> → 20% each · <b>20 things</b> → 5% each",
        visual: function (v) { v.appendChild(makeItems(4, 1, "🍕", true)); v.appendChild(caption("1 of 4 = 25%")); }
      },
      gen: function () {
        var total = pickOne([2, 4, 4, 5, 5, 20]), each = 100 / total, k = randInt(1, total - 1), ans = k * each;
        var emoji = pickOne(ITEM_EMOJI);
        return { prompt: "What percent of the " + emoji + " are glowing?", answer: ans, unit: "%",
          options: buildOptions(ans, [k, ans + each, ans - each, 100 - ans, k * 10], each, 0, 100),
          render: function (s) { s.appendChild(makeItems(total, k, emoji)); },
          count: function (s) { return partSteps(s, ".item.lit", each); } };
      } },

    { label: "a/b", title: "Fractions are percents",
      lesson: {
        text: "A fraction cuts the whole into equal parts.<br><b>1/4</b> → 100% ÷ 4 = <b>25%</b> per part.<br>So <b>3/4</b> = 25% + 25% + 25% = <b>75%</b>.",
        visual: function (v) { v.appendChild(makeFraction(1, 4)); v.appendChild(makeFractionBar(1, 4)); v.appendChild(caption("1/4 = 25%")); }
      },
      gen: function () {
        var f = pickOne([[1, 2], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5], [1, 10], [3, 10], [7, 10], [9, 10]]);
        var num = f[0], den = f[1], each = 100 / den, ans = num * each;
        return { prompt: "What percent is this fraction?", answer: ans, unit: "%",
          options: buildOptions(ans, [num * 10, num * 10 + den, each, 100 - ans, ans + each, ans - each], each, 1, 100),
          render: function (s) { s.appendChild(makeFraction(num, den)); s.appendChild(makeFractionBar(num, den)); },
          count: function (s) { return partSteps(s, ".fseg.on", each); } };
      } },

    { label: "% of", title: "Percent of a number",
      lesson: {
        text: "To find a percent <b>of</b> a number:<br><b>100%</b> = all of it · <b>50%</b> = half (÷ 2) · <b>10%</b> = ÷ 10",
        visual: function (v) { v.appendChild(makeNumberBar("20", 50)); v.appendChild(caption("50% of 20 = 10")); }
      },
      gen: function () {
        var pct = pickOne([50, 50, 10, 10, 100]), n, ans, hint;
        if (pct === 50) { n = 2 * randInt(2, 30); ans = n / 2; hint = "50% is half: " + n + " ÷ 2 = ?"; }
        else if (pct === 10) { n = 10 * randInt(2, 20); ans = n / 10; hint = "10% is one tenth: " + n + " ÷ 10 = ?"; }
        else { n = randInt(3, 60); ans = n; hint = "100% is the whole thing — all " + n + "!"; }
        return { prompt: "Find the percent of the number", answer: ans, unit: "",
          options: buildOptions(ans, [n, ans + 1, ans - 1, ans * 2, ans + 10, n / 4], 2, 0, 999),
          render: function (s) { s.appendChild(makeEquation([pct + "%", "of", "" + n, "=", "?"])); s.appendChild(makeNumberBar("" + n, pct)); },
          hint: hint };
      } },

    { label: "% of+", title: "Tricky percents",
      lesson: {
        text: "Find <b>10%</b> first, then multiply.<br>30% of 50 → 10% is 5 → 3 × 5 = <b>15</b>.<br><b>25%</b> is a quarter (÷ 4), and <b>75%</b> is 3 quarters.",
        visual: function (v) { v.appendChild(makeNumberBar("50", 30)); v.appendChild(caption("30% of 50 = 15")); }
      },
      gen: function () {
        var pct = pickOne([20, 30, 40, 60, 25, 75]), n, hint;
        if (pct % 25 === 0) {
          n = 4 * randInt(2, 20);
          hint = pct === 25 ? "25% is a quarter: " + n + " ÷ 4 = ?"
                            : "25% of " + n + " is " + (n / 4) + ", and 75% is 3 × " + (n / 4) + " = ?";
        } else {
          n = 10 * randInt(2, 15);
          hint = "10% of " + n + " is " + (n / 10) + ", so " + pct + "% is " + (pct / 10) + " × " + (n / 10) + " = ?";
        }
        var ans = n * pct / 100, tenth = n / 10;
        return { prompt: "Find the percent of the number", answer: ans, unit: "",
          options: buildOptions(ans, [ans + tenth, ans - tenth, n - ans, pct, ans + 1, ans - 1], 1, 0, 999),
          render: function (s) { s.appendChild(makeEquation([pct + "%", "of", "" + n, "=", "?"])); s.appendChild(makeNumberBar("" + n, pct)); },
          hint: hint };
      } },

    { label: "Sale", title: "Shopping sale!",
      lesson: {
        text: "<b>25% off</b> means the price drops by 25% of itself.<br>Find the discount, then subtract it:<br>$40 → 25% of 40 is $10 → $40 − $10 = <b>$30</b>.",
        visual: function (v) { v.appendChild(makeNumberBar("$40", 25, true)); v.appendChild(caption("$40 − 25% = $30")); }
      },
      gen: function () {
        var pct = pickOne([10, 20, 25, 50]), price;
        if (pct === 25) price = 4 * randInt(2, 20);
        else if (pct === 50) price = 2 * randInt(3, 40);
        else price = 10 * randInt(1, 12);
        var off = price * pct / 100, ans = price - off;
        return { prompt: "Sale! What is the new price?", answer: ans, unit: "$",
          options: buildOptions(ans, [off, price, ans + off, ans - 1, ans + 1, price - pct], 1, 1, 999),
          render: function (s) {
            var tag = el("div", "price-tag");
            tag.appendChild(el("span", "price", "$" + price));
            tag.appendChild(el("span", "sticker", "−" + pct + "%"));
            s.appendChild(tag);
            s.appendChild(makeNumberBar("$" + price, pct, true));
          },
          hint: pct + "% of $" + price + " is $" + off + " off. $" + price + " − $" + off + " = ?" };
      } }
  ];
  var MAX_LEVEL = LEVELS.length;

  // -------------------- State --------------------
  function defaultState() {
    return {
      maxUnlocked: 1,   // highest unlocked level
      stars: {},        // level -> best star count (0..3)
      totalStars: 0,    // lifetime correct-answer counter shown in HUD
      critters: [],     // level numbers whose pet has been collected
      seenLesson: {},   // level -> true once its lesson card was shown
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
    blip: function (n) { tone(300 + n * 6, 0.04, "sine", 0.08); },
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
  //  BUBBLING LAB BACKGROUND
  // ============================================================
  var bg = $("bubbles-bg"), bgx = bg.getContext("2d"), bubbles = [];
  function resizeBg() {
    bg.width = window.innerWidth; bg.height = window.innerHeight;
    bubbles = [];
    var count = Math.round((bg.width * bg.height) / 22000);
    for (var i = 0; i < count; i++) {
      bubbles.push({ x: Math.random() * bg.width, y: Math.random() * bg.height,
        r: Math.random() * 6 + 2, sp: Math.random() * 0.5 + 0.2, wob: Math.random() * Math.PI * 2 });
    }
  }
  function drawBg() {
    var grad = bgx.createLinearGradient(0, 0, 0, bg.height);
    grad.addColorStop(0, "#1a1038"); grad.addColorStop(1, "#3b1d6e");
    bgx.fillStyle = grad; bgx.fillRect(0, 0, bg.width, bg.height);
    bgx.strokeStyle = "rgba(167, 243, 208, 0.35)";
    bgx.lineWidth = 1.5;
    for (var i = 0; i < bubbles.length; i++) {
      var b = bubbles[i];
      b.y -= b.sp; b.wob += 0.02;
      if (b.y < -10) { b.y = bg.height + 10; b.x = Math.random() * bg.width; }
      bgx.beginPath(); bgx.arc(b.x + Math.sin(b.wob) * 6, b.y, b.r, 0, Math.PI * 2); bgx.stroke();
    }
    requestAnimationFrame(drawBg);
  }

  // ============================================================
  //  CONFETTI
  // ============================================================
  var confetti = $("confetti-canvas"), cfx = confetti.getContext("2d");
  var pieces = [], confettiId = null;
  function resizeConfetti() { confetti.width = window.innerWidth; confetti.height = window.innerHeight; }
  function burstConfetti(big) {
    var colors = ["#ffd23f", "#2dd4bf", "#a78bfa", "#ff6b6b", "#ff8fc8", "#ff9f45"];
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
  //  LAB SHELVES (LEVEL MAP)
  // ============================================================
  function buildMap() {
    $("map-stars").textContent = state.totalStars;
    var trail = $("path-trail");
    trail.innerHTML = "";
    for (var lv = 1; lv <= MAX_LEVEL; lv++) {
      var unlocked = lv <= state.maxUnlocked;
      var node = el("div", "path-node" + (unlocked ? "" : " locked") + (lv === state.maxUnlocked ? " current" : ""));

      node.appendChild(el("div", "path-emoji", PATH_ICONS[lv - 1]));
      node.appendChild(el("div", "path-label", LEVELS[lv - 1].label));

      var starsWrap = el("div", "path-stars");
      var earned = state.stars[lv] || 0;
      for (var i = 0; i < 3; i++) starsWrap.appendChild(el("span", i < earned ? "on" : "off", "★"));
      node.appendChild(starsWrap);

      if (!unlocked) node.appendChild(el("div", "path-lock", "🔒"));

      if (unlocked) {
        node.addEventListener("click", (function (level) {
          return function () { sfx.tap(); startLevel(level); };
        })(lv));
      }
      trail.appendChild(node);
    }
  }

  // ============================================================
  //  LESSON CARD
  // ============================================================
  function lessonOpen() { return $("lesson").classList.contains("show"); }
  function showLesson(level) {
    var cfg = LEVELS[level - 1];
    $("lesson-icon").textContent = PATH_ICONS[level - 1];
    $("lesson-title").textContent = cfg.title;
    var vis = $("lesson-visual");
    vis.innerHTML = "";
    cfg.lesson.visual(vis);
    $("lesson-text").innerHTML = cfg.lesson.text;
    $("lesson").classList.add("show");
  }
  function closeLesson() {
    $("lesson").classList.remove("show");
    if (mission) { state.seenLesson[mission.level] = true; save(); }
  }

  // ============================================================
  //  QUESTION ENGINE
  // ============================================================
  var mission = null; // { level, cfg, progress, misses, combo, current, locked, paint }

  function setHint(text) {
    var h = $("hint");
    h.textContent = text || "";
    h.classList.toggle("show", !!text);
  }

  function newQuestion() {
    var q = mission.cfg.gen();
    q.buffer = "";
    mission.current = q;
    mission.locked = false;

    $("prompt").textContent = q.prompt;
    var stage = $("stage");
    stage.innerHTML = "";
    stage.classList.remove("solved");
    q.render(stage);
    setHint("");

    var paint = q.mode === "paint";
    $("answer-boxes").style.display = paint ? "none" : "";
    $("paint-controls").classList.toggle("active", paint);
    if (paint) setupPaint(stage.querySelector(".hgrid"));
    else renderBoxes();
  }

  function renderBoxes() {
    var wrap = $("answer-boxes");
    wrap.classList.remove("locked");
    wrap.innerHTML = "";
    mission.current.options.forEach(function (val) {
      var box = el("button", "answer-box", fmt(val, mission.current.unit));
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

  // -------------------- Paint mode --------------------
  // Tap a cell to fill up to it (tap the last painted cell again to remove
  // it); drag across cells to paint quickly.
  function setupPaint(grid) {
    var painting = false, downCell = -1;
    mission.paint = 0;
    refreshReadout();
    grid.classList.add("paintable");

    function cellAt(x, y) {
      var t = document.elementFromPoint(x, y);
      return t && t.parentNode === grid ? +t.getAttribute("data-i") : -1;
    }
    grid.addEventListener("pointerdown", function (e) {
      if (mission.locked) return;
      var i = cellAt(e.clientX, e.clientY);
      if (i < 0) return;
      painting = true; downCell = i;
      try { grid.setPointerCapture(e.pointerId); } catch (err) {}
      paintTo(grid, mission.paint === i + 1 ? i : i + 1);
      e.preventDefault();
    });
    grid.addEventListener("pointermove", function (e) {
      if (!painting || mission.locked) return;
      var i = cellAt(e.clientX, e.clientY);
      if (i < 0 || i === downCell) return;
      downCell = -1;
      paintTo(grid, i + 1);
    });
    function stop() { painting = false; }
    grid.addEventListener("pointerup", stop);
    grid.addEventListener("pointercancel", stop);
  }

  function paintTo(grid, n) {
    if (n === mission.paint) return;
    mission.paint = n;
    setGridFill(grid, n);
    sfx.blip(n);
    refreshReadout();
    setHint("");
  }
  function refreshReadout() { $("paint-readout").textContent = mission.paint + "%"; }

  function checkPaint() {
    if (mission.locked) return;
    var q = mission.current;
    if (mission.paint === q.answer) { onCorrect(null); return; }
    mission.misses++;
    mission.combo = 0;
    sfx.wrong();
    var btn = $("btn-check");
    btn.classList.remove("wrong"); void btn.offsetWidth; btn.classList.add("wrong");
    var diff = q.answer - mission.paint;
    setHint(diff > 0 ? "You painted " + mission.paint + "%. Paint " + diff + " more " + (diff === 1 ? "box" : "boxes") + "!"
                     : "You painted " + mission.paint + "%. That's " + (-diff) + " too many!");
    save();
  }

  // ============================================================
  //  MISSION / GAMEPLAY
  // ============================================================
  function startLevel(level) {
    mission = { level: level, cfg: LEVELS[level - 1], progress: 0, misses: 0, combo: 0, current: null, paint: 0 };
    $("mission-stars").textContent = state.totalStars;
    buildProgressDots();
    showScreen("mission");
    audio(); // unlock audio on the click that got us here
    newQuestion();
    if (!state.seenLesson[level]) showLesson(level);
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
    if (val === mission.current.answer) onCorrect(box); else onWrong(box);
  }

  // `box` is the chosen answer box, or null for a correct paint.
  function onCorrect(box) {
    mission.locked = true;
    if (box) {
      $("answer-boxes").classList.add("locked");
      box.classList.add("correct");
      $("answer-boxes").querySelectorAll(".answer-box").forEach(function (b) { if (b !== box) b.classList.add("dim"); });
    }
    $("stage").classList.add("solved");
    setHint("✨ " + fmt(mission.current.answer, mission.current.unit) + " — yes!");

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

    var token = mission;
    setTimeout(function () {
      if (mission !== token) return;
      if (mission.progress >= STEPS_TO_STOP) finishLevel();
      else newQuestion();
    }, 1100);
  }

  function onWrong(box) {
    mission.locked = true;
    $("answer-boxes").classList.add("locked");
    box.classList.add("wrong");
    mission.misses++;
    mission.combo = 0;
    sfx.wrong();
    save();

    var q = mission.current;
    if (q.count) {
      countUp(q.count($("stage")), function () { unlockInput(box); });
    } else {
      setHint("💡 " + q.hint);
      setTimeout(function () { unlockInput(box); }, 700);
    }
  }

  function unlockInput(box) {
    box.classList.remove("wrong");
    box.classList.add("dim"); // already ruled out
    $("answer-boxes").classList.remove("locked");
    mission.locked = false;
    mission.current.buffer = "";
  }

  // Flash groups of elements one after another with a running total in
  // the hint line, so the child watches the percent being counted up.
  function countUp(steps, done) {
    var token = mission, i = 0;
    function step() {
      if (mission !== token) return; // left the level mid-animation
      if (i >= steps.length) { setTimeout(done, 400); return; }
      var s = steps[i];
      s.els.forEach(function (e) { e.classList.remove("flash"); void e.offsetWidth; e.classList.add("flash"); });
      setHint(s.text);
      sfx.boop(i % 8);
      i++;
      setTimeout(step, s.delay);
    }
    setTimeout(step, 300);
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

    mission = null;
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
    var critter = $("reward-critter");
    critter.textContent = CRITTERS[level - 1];
    critter.style.animation = "none"; void critter.offsetWidth; critter.style.animation = "";
    sfx.fanfare();
    burstConfetti(true);

    $("btn-reward-next").onclick = function () {
      sfx.tap();
      if (newlyUnlocked) startLevel(level + 1);
      else { buildMap(); showScreen("map"); }
    };
  }

  // ============================================================
  //  LAB BOOK (COLLECTION)
  // ============================================================
  function buildBook() {
    $("book-stars").textContent = state.totalStars;
    var grid = $("critter-grid");
    grid.innerHTML = "";
    CRITTERS.forEach(function (c, i) {
      var owned = state.critters.indexOf(i + 1) !== -1;
      grid.appendChild(el("div", "critter-cell" + (owned ? " owned" : " empty"), owned ? c : "❔"));
    });
  }

  // ============================================================
  //  INPUT (keyboard typing, mirrors click behaviour)
  // ============================================================
  document.addEventListener("keydown", function (e) {
    if (!screens.mission.classList.contains("active")) return;
    if (lessonOpen()) {
      if (e.key === "Enter" || e.key === "Escape") { closeLesson(); e.preventDefault(); }
      return;
    }
    if (mission == null || mission.locked || mission.current == null) return;

    if (mission.current.mode === "paint") {
      if (e.key === "Enter") { checkPaint(); e.preventDefault(); }
      return;
    }

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
    if (box && !box.classList.contains("dim")) pick(val, box);
    else { q.buffer = ""; highlightTyping(); }
  }

  // ============================================================
  //  BUTTON WIRING
  // ============================================================
  $("btn-book").addEventListener("click", function () { sfx.tap(); buildBook(); showScreen("book"); });
  $("btn-book-back").addEventListener("click", function () { sfx.tap(); buildMap(); showScreen("map"); });
  $("btn-back").addEventListener("click", function () { sfx.tap(); mission = null; buildMap(); showScreen("map"); });
  $("btn-reward-home").addEventListener("click", function () { sfx.tap(); buildMap(); showScreen("map"); });
  $("btn-lesson").addEventListener("click", function () { sfx.tap(); if (mission) showLesson(mission.level); });
  $("btn-lesson-go").addEventListener("click", function () { sfx.tap(); closeLesson(); });
  $("btn-check").addEventListener("click", function () { if (mission) checkPaint(); });

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
