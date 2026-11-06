/*
 * Experience: the dot-matrix printer. Every .pl element is printed when it comes
 * out of the printer's slot: line by line from left to right, the print head
 * travelling along, with a buzzing dot-matrix sound. Scrolling fast makes the
 * printer catch up quickly.
 */
(function () {
  "use strict";
  if (window.__pageTeardown) window.__pageTeardown();
  var root = document.querySelector("[data-printout]");
  if (!root) return;
  var lines = [].slice.call(root.querySelectorAll(".pl"));
  var printer = root.querySelector(".printer");
  var slot = root.querySelector(".printer-slot");
  var head = root.querySelector(".printer-head");
  var online = root.querySelector("[data-online]");
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var offs = [],
    dead = false;
  function on(t, ev, fn, o) {
    t.addEventListener(ev, fn, o);
    offs.push(function () {
      t.removeEventListener(ev, fn, o);
    });
  }
  window.__pageTeardown = function () {
    dead = true;
    offs.forEach(function (f) {
      f();
    });
    window.__pageTeardown = null;
  };
  if (reduce || !Element.prototype.animate) return;
  root.classList.add("js");

  // ---------------------------------------------------------------- sound
  var audio = null;
  function unlock() {
    if (!audio && window.__bgAudio) audio = window.__bgAudio;
    if (audio) {
      if (audio.state === "suspended") audio.resume();
      return;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      audio = window.__bgAudio = new AC();
    } catch (err) {
      audio = null;
    }
  }
  function running() {
    return audio && audio.state === "running";
  }
  // a row of needle strikes: short clicks at a fast, slightly uneven rate
  function buzz(dur, density) {
    if (!running() || dur < 0.03) return;
    var sr = audio.sampleRate,
      n = Math.ceil(sr * dur);
    var buf = audio.createBuffer(1, n, sr),
      d = buf.getChannelData(0);
    var period = Math.round(sr / 160);
    for (var s = 0; s < n; s += period) {
      if (Math.random() > density) continue;
      var a = 0.5 + Math.random() * 0.5;
      for (var k = 0; k < 40 && s + k < n; k++) d[s + k] += (Math.random() * 2 - 1) * a * Math.pow(1 - k / 40, 2);
    }
    var src = audio.createBufferSource();
    src.buffer = buf;
    var f = audio.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 2400;
    f.Q.value = 0.8;
    var g = audio.createGain();
    g.gain.value = 0.09;
    src.connect(f);
    f.connect(g);
    g.connect(audio.destination);
    src.start();
  }
  // the paper advancing one line
  function feed() {
    if (!running()) return;
    var now = audio.currentTime;
    var o = audio.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(140, now);
    o.frequency.exponentialRampToValueAtTime(90, now + 0.05);
    var g = audio.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.035, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    o.connect(g);
    g.connect(audio.destination);
    o.start(now);
    o.stop(now + 0.07);
  }

  // ---------------------------------------------------------------- printing
  var queued = 0,
    busy = false;
  function headY() {
    return slot.getBoundingClientRect().top + 4;
  }
  function check() {
    if (dead) return;
    if (window.scrollY > 20) root.classList.add("is-going");
    var y = headY();
    while (queued < lines.length && lines[queued].getBoundingClientRect().bottom <= y) queued++;
    if (!busy) run();
  }
  var printed = 0;
  function run() {
    if (dead || printed >= queued) {
      busy = false;
      if (online) online.classList.remove("on");
      return;
    }
    busy = true;
    if (online) online.classList.add("on");
    printLine(lines[printed++], run);
  }

  function printLine(el, done) {
    var w = el.offsetWidth,
      h = el.offsetHeight;
    var lh = parseFloat(getComputedStyle(el).lineHeight) || 24;
    var rows = Math.max(1, Math.round(h / lh));
    var lag = queued - printed; // lines waiting after this one
    var per = lag > 6 ? 28 : lag > 2 ? 70 : 170; // ms per printed row
    var sr = slot.getBoundingClientRect(),
      er = el.getBoundingClientRect();
    var x0 = er.left - sr.left - 23,
      x1 = er.right - sr.left - 23;
    var r = 0;
    function poly(x, y0, y1) {
      return "polygon(0 0," + w + "px 0," + w + "px " + y0 + "px," + x + "px " + y0 + "px," + x + "px " + y1 + "px,0 " + y1 + "px)";
    }
    (function row() {
      if (dead) return;
      if (r >= rows) {
        el.classList.add("is-done");
        el.getAnimations().forEach(function (an) {
          an.cancel();
        });
        done();
        return;
      }
      var y0 = Math.round((r * h) / rows),
        y1 = Math.round(((r + 1) * h) / rows);
      // how much of the row carries ink decides how long the head takes
      var dur = per * (rows === 1 ? Math.max(0.35, Math.min(1, (el.scrollWidth || w) / Math.max(w, 1))) : 1);
      buzz(dur / 1000, 0.75);
      var a = el.animate([{ clipPath: poly(0, y0, y1) }, { clipPath: poly(w, y0, y1) }], {
        duration: dur,
        easing: "steps(" + Math.max(6, Math.round(dur / 12)) + ")",
        fill: "forwards",
      });
      head.animate([{ transform: "translateX(" + x0 + "px)" }, { transform: "translateX(" + x1 + "px)" }], { duration: dur, fill: "forwards" });
      a.onfinish = function () {
        r++;
        feed();
        setTimeout(row, lag > 2 ? 0 : 25);
      };
    })();
  }

  on(window, "scroll", check, { passive: true });
  on(window, "resize", check, { passive: true });
  ["pointerdown", "keydown", "touchend"].forEach(function (ev) {
    on(window, ev, unlock, { passive: true });
  });
  unlock();
  // the lines already out of the printer when the page opens print right away
  setTimeout(check, 250);
})();
