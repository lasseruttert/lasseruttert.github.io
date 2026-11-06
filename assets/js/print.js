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
  var paper = root.querySelector(".paper");
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
  // The paper starts fully inside the printer at scrollY = 0 and can only rise
  // out of the slot as each row is printed (fedPx), so scrolling faster never
  // outruns the print head.
  var fedPx = 0,
    printed = 0,
    curEl = null,
    curRow = 0,
    curRows = 0,
    busy = false,
    allPrinted = false;

  function headOffset() {
    var pt = parseFloat(getComputedStyle(root).paddingTop) || 0;
    var sy = slot.getBoundingClientRect().top + 12;
    return Math.max(0, pt - sy);
  }

  function syncPaper() {
    if (!paper) return;
    if (allPrinted || window.scrollY <= fedPx) {
      paper.style.transform = "";
    } else {
      paper.style.transform = "translateY(" + Math.round(window.scrollY - fedPx) + "px)";
    }
  }

  function poly(w, x, y0, y1) {
    return "polygon(0 0," + w + "px 0," + w + "px " + y0 + "px," + x + "px " + y0 + "px," + x + "px " + y1 + "px,0 " + y1 + "px)";
  }

  function check() {
    if (dead) return;
    if (window.scrollY > 10) root.classList.add("is-going");
    if (allPrinted || busy) {
      syncPaper();
      return;
    }

    if (!curEl) {
      if (printed >= lines.length) {
        allPrinted = true;
        root.classList.remove("is-printing");
        if (online) online.classList.remove("on");
        syncPaper();
        return;
      }
      curEl = lines[printed];
      var lh = parseFloat(getComputedStyle(curEl).lineHeight) || 24;
      curRows = Math.max(1, Math.round(curEl.offsetHeight / lh));
      curRow = 0;
    }

    var w = curEl.offsetWidth,
      h = curEl.offsetHeight;
    var y0 = Math.round((curRow * h) / curRows),
      y1 = Math.round(((curRow + 1) * h) / curRows);
    var ho = headOffset();
    var rowStart = ho + curEl.offsetTop + y0;
    var rowEnd = ho + curEl.offsetTop + y1;

    // allow blank margin before the next text row to feed up to the print head
    if (window.scrollY > fedPx && fedPx < rowStart) {
      fedPx = Math.min(window.scrollY, rowStart);
    }

    if (window.scrollY < rowEnd - 4) {
      root.classList.remove("is-printing");
      if (online) online.classList.remove("on");
      syncPaper();
      return;
    }

    // feed this single row into the slot and lock the paper there while printing it
    fedPx = Math.max(fedPx, Math.min(window.scrollY, rowEnd));
    busy = true;
    root.classList.add("is-printing");
    if (online) online.classList.add("on");
    syncPaper();

    var ahead = Math.max(0, window.scrollY - fedPx);
    var per = ahead > 500 ? 22 : ahead > 220 ? 42 : ahead > 80 ? 75 : 135;
    var dur = per * (curRows === 1 ? Math.max(0.35, Math.min(1, (curEl.scrollWidth || w) / Math.max(w, 1))) : 1);

    var sr = slot.getBoundingClientRect(),
      er = curEl.getBoundingClientRect();
    var x0 = er.left - sr.left - 23,
      x1 = er.right - sr.left - 23;

    buzz(dur / 1000, 0.75);
    var el = curEl;
    var a = el.animate([{ clipPath: poly(w, 0, y0, y1) }, { clipPath: poly(w, w, y0, y1) }], {
      duration: dur,
      easing: "steps(" + Math.max(6, Math.round(dur / 12)) + ")",
      fill: "forwards",
    });
    head.animate([{ transform: "translateX(" + x0 + "px)" }, { transform: "translateX(" + x1 + "px)" }], { duration: dur, fill: "forwards" });
    a.onfinish = function () {
      if (dead) return;
      curRow++;
      feed();
      if (curRow >= curRows) {
        el.classList.add("is-done");
        el.getAnimations().forEach(function (an) {
          an.cancel();
        });
        curEl = null;
        printed++;
      }
      busy = false;
      var lag = Math.max(0, window.scrollY - fedPx);
      setTimeout(check, lag > 80 ? 0 : 18);
    };
  }

  on(window, "scroll", check, { passive: true });
  on(window, "resize", check, { passive: true });
  ["pointerdown", "keydown", "touchend"].forEach(function (ev) {
    on(window, ev, unlock, { passive: true });
  });
  unlock();
  check();
})();
