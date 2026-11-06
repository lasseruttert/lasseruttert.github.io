/*
 * Projects: the floppy box. A disk slides up with a soft plastic sound when the
 * pointer is on it; clicking flies it into the drive (clunk, motor whirr, LED)
 * and the window next to the drive reads it and shows the project. Picking
 * another disk puts the first one back in the box. On touch screens the first
 * tap pulls a disk out, the second one inserts it.
 */
(function () {
  "use strict";
  if (window.__pageTeardown) window.__pageTeardown();
  var root = document.querySelector("[data-floppies]");
  if (!root) return;
  var disks = [].slice.call(root.querySelectorAll(".disk"));
  var drive = root.querySelector(".drive");
  var slot = root.querySelector("[data-slot]");
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var offs = [],
    timers = [],
    fly = null,
    dead = false;
  function on(t, ev, fn, o) {
    t.addEventListener(ev, fn, o);
    offs.push(function () {
      t.removeEventListener(ev, fn, o);
    });
  }
  function later(fn, ms) {
    timers.push(
      setTimeout(function () {
        if (!dead) fn();
      }, ms)
    );
  }
  window.__pageTeardown = function () {
    dead = true;
    offs.forEach(function (f) {
      f();
    });
    timers.forEach(clearTimeout);
    if (fly && fly.parentNode) fly.parentNode.removeChild(fly);
    window.__pageTeardown = null;
  };

  // ---------------------------------------------------------------- sound
  var audio = null,
    noise = null;
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
  function ready() {
    if (!audio || audio.state !== "running") return false;
    if (!noise) {
      noise = audio.createBuffer(1, Math.ceil(audio.sampleRate * 1.2), audio.sampleRate);
      var d = noise.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return true;
  }
  function burst(t, dur, type, freq, q, gain, attack) {
    var src = audio.createBufferSource();
    src.buffer = noise;
    var f = audio.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    var g = audio.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + (attack || 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(audio.destination);
    src.start(t, Math.random() * 0.2, dur + 0.02);
  }
  var lastSlide = 0;
  // plastic sliding against plastic
  function slide() {
    if (!ready()) return;
    var now = audio.currentTime;
    if (now - lastSlide < 0.08) return;
    lastSlide = now;
    burst(now, 0.09, "bandpass", 1400 + Math.random() * 500, 1.4, 0.05, 0.03);
  }
  // the disk clicking into place, then the motor and the head seeking
  function load() {
    if (!ready()) return;
    var now = audio.currentTime;
    burst(now, 0.05, "lowpass", 900, 0.8, 0.22);
    burst(now + 0.02, 0.04, "highpass", 2500, 0.7, 0.08);
    var o = audio.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(55, now + 0.12);
    o.frequency.linearRampToValueAtTime(75, now + 0.4);
    var lp = audio.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 380;
    var g = audio.createGain();
    g.gain.setValueAtTime(0.0001, now + 0.12);
    g.gain.linearRampToValueAtTime(0.05, now + 0.2);
    g.gain.setValueAtTime(0.05, now + 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);
    o.connect(lp);
    lp.connect(g);
    g.connect(audio.destination);
    o.start(now + 0.12);
    o.stop(now + 0.8);
    for (var k = 0; k < 5; k++) burst(now + 0.22 + k * 0.07 + Math.random() * 0.02, 0.02, "bandpass", 3000, 2, 0.06);
  }

  // ---------------------------------------------------------------- pulling a disk out
  var touch = false;
  on(
    window,
    "touchstart",
    function () {
      touch = true;
    },
    { passive: true }
  );
  disks.forEach(function (d) {
    on(d, "mouseenter", slide);
    on(d, "focus", slide);
    on(d, "click", function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault();
      if (touch && !d.classList.contains("is-up")) {
        disks.forEach(function (o) {
          o.classList.remove("is-up");
        });
        d.classList.add("is-up");
        slide();
        return;
      }
      insert(d);
    });
  });

  // ---------------------------------------------------------------- into the drive, onto the screen
  var viewer = root.querySelector("[data-viewer]");
  var vBody = root.querySelector("[data-viewer-body]");
  var vTitle = root.querySelector("[data-viewer-title]");
  var vStatus = root.querySelector("[data-viewer-status]");
  var ejectBtn = root.querySelector("[data-eject]");
  var emptyHTML = vBody ? vBody.innerHTML : "";
  var busy = false,
    current = null; // the disk in the drive
  function eject(resetViewer) {
    if (!current) return;
    var back = current;
    current = null;
    back.style.visibility = "";
    back.classList.remove("is-back");
    void back.offsetWidth;
    back.classList.add("is-back");
    later(function () {
      back.classList.remove("is-back");
    }, 350);
    if (ready()) burst(audio.currentTime, 0.06, "lowpass", 700, 0.8, 0.12);
    if (resetViewer && vBody) {
      vTitle.textContent = "A:\\ \u2014 Project Viewer";
      vStatus.textContent = "Ready \u2014 Disk ejected";
      vBody.innerHTML = emptyHTML;
    }
  }
  if (ejectBtn) {
    on(ejectBtn, "click", function () {
      if (!busy && current) eject(true);
    });
  }
  function show(d) {
    var tpl = root.querySelector('template[data-project="' + d.getAttribute("data-disk") + '"]');
    var name = (d.querySelector(".disk-title") || {}).textContent || "";
    vTitle.textContent = "A:\\ " + name.trim();
    vStatus.textContent = "Reading drive A: ...";
    vBody.innerHTML = '<p class="viewer-reading">Reading disk in Drive A:&hellip;<span class="bar"><i></i></span></p>';
    later(
      function () {
        vBody.innerHTML = "";
        if (tpl) vBody.appendChild(document.importNode(tpl.content, true));
        vStatus.textContent = "Ready \u2014 " + name.trim();
        drive.classList.remove("is-loading");
        busy = false;
      },
      reduce ? 0 : 700
    );
    // on narrow screens the window sits below the box
    if (window.innerWidth <= 920 && viewer.scrollIntoView) viewer.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }
  function insert(d) {
    if (busy || d === current) return;
    busy = true;
    disks.forEach(function (o) {
      o.classList.remove("is-up");
    });
    eject(false);
    if (reduce || !Element.prototype.animate) {
      current = d;
      d.style.visibility = "hidden";
      show(d);
      return;
    }
    var card = d.querySelector(".disk-card") || d;
    var r = card.getBoundingClientRect(),
      s = slot.getBoundingClientRect();
    if (fly && fly.parentNode) fly.parentNode.removeChild(fly);
    fly = d.cloneNode(true);
    fly.classList.add("disk-fly");
    fly.classList.remove("is-up");
    fly.style.left = r.left + "px";
    fly.style.top = r.top + "px";
    fly.style.width = r.width + "px";
    fly.style.height = r.height + "px";
    fly.style.transformOrigin = "50% 100%";
    document.body.appendChild(fly);
    d.style.visibility = "hidden";
    current = d;
    var sc = (s.width * 0.92) / r.width;
    var tx = s.left + s.width / 2 - (r.left + r.width / 2),
      ty = s.top + s.height / 2 - r.bottom;
    var a = fly.animate(
      [
        { transform: "translate(0,0) scale(1)" },
        { transform: "translate(" + tx + "px," + (ty - 28) + "px) scale(" + sc + ")", offset: 0.75 },
        { transform: "translate(" + tx + "px," + ty + "px) scale(" + sc + ")" },
      ],
      { duration: 460, easing: "steps(10)", fill: "forwards" }
    );
    a.onfinish = function () {
      if (dead) return;
      drive.classList.add("is-loading");
      load();
      // slide in: the part below the slot disappears
      var b = fly.animate(
        [
          { transform: "translate(" + tx + "px," + ty + "px) scale(" + sc + ")", clipPath: "inset(0 0 0 0)" },
          { transform: "translate(" + tx + "px," + (ty + r.height * sc) + "px) scale(" + sc + ")", clipPath: "inset(0 0 100% 0)" },
        ],
        { duration: 220, easing: "steps(6)", fill: "forwards" }
      );
      b.onfinish = function () {
        if (fly && fly.parentNode) fly.parentNode.removeChild(fly);
        fly = null;
      };
      show(d);
    };
  }
  // a link to /projects/#slug opens with that disk in the drive
  var start = location.hash && root.querySelector('[data-disk="' + decodeURIComponent(location.hash.slice(1)) + '"]');
  if (start)
    later(function () {
      insert(start);
    }, 300);

  ["pointerdown", "keydown", "touchend"].forEach(function (ev) {
    on(window, ev, unlock, { passive: true });
  });
  unlock();
})();
