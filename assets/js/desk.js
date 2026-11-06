/*
 * About page: the chat on the old monitor. Scrolling decides how many messages
 * should be there; each new one first shows "Lasse is typing...", then types out
 * letter by letter with soft key clicks. After the last message, links to the
 * other pages appear as replies.
 */
(function () {
  "use strict";
  if (window.__pageTeardown) window.__pageTeardown();
  var root = document.querySelector("[data-desk]");
  if (!root) return;

  var msgs = [].slice.call(root.querySelectorAll("[data-msg]"));
  var texts = msgs.map(function (m) {
    return m.querySelector(".txt").textContent;
  });
  var body = root.querySelector(".chat-body");
  var typing = root.querySelector(".typing");
  var options = root.querySelector("[data-options]");
  var hint = root.querySelector("[data-hint]");
  var clock = root.querySelector("[data-clock]");
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var offs = [],
    timers = [],
    dead = false;
  function on(t, ev, fn, o) {
    t.addEventListener(ev, fn, o);
    offs.push(function () {
      t.removeEventListener(ev, fn, o);
    });
  }
  function later(fn, ms) {
    var id = setTimeout(function () {
      if (!dead) fn();
    }, ms);
    timers.push(id);
    return id;
  }
  window.__pageTeardown = function () {
    dead = true;
    offs.forEach(function (f) {
      f();
    });
    timers.forEach(clearTimeout);
    window.__pageTeardown = null;
  };

  root.classList.add("js");

  // ---------------------------------------------------------------- sound: a soft typing click
  var audio = null,
    noise = null,
    lastTick = 0;
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
  function burst(t, dur, type, freq, q, gain) {
    var src = audio.createBufferSource();
    src.buffer = noise;
    var f = audio.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    var g = audio.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.0008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(audio.destination);
    src.start(t, Math.random() * 0.05, dur + 0.01);
  }
  function tick(space) {
    if (!audio || audio.state !== "running") return;
    var now = audio.currentTime;
    if (now - lastTick < 0.045) return;
    lastTick = now;
    if (!noise) {
      noise = audio.createBuffer(1, Math.ceil(audio.sampleRate * 0.1), audio.sampleRate);
      var d = noise.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    var v = 0.85 + Math.random() * 0.3;
    burst(now, 0.012, "highpass", 3800 * v, 0.7, 0.1);
    burst(now + 0.007 + Math.random() * 0.006, space ? 0.03 : 0.022, "bandpass", (space ? 1300 : 2000) * v, 2.5, space ? 0.1 : 0.07);
  }

  // ---------------------------------------------------------------- the chat
  var shown = 0, // messages started
    busy = false;

  function wanted() {
    var r = root.getBoundingClientRect();
    var room = root.offsetHeight - window.innerHeight;
    var p = room > 0 ? Math.min(1, Math.max(0, -r.top / room)) : 1;
    // the first message is there right away, the last one shortly before the end
    return Math.min(msgs.length, 1 + Math.floor(p * msgs.length * 1.08));
  }
  function toBottom() {
    body.scrollTop = body.scrollHeight;
  }
  function finish() {
    options.classList.add("is-shown");
    if (hint) hint.textContent = "Pick a reply above";
    toBottom();
  }
  function next() {
    if (dead || busy || shown >= wanted()) return;
    busy = true;
    var i = shown++;
    var behind = wanted() - shown; // catch up quickly when the visitor scrolled far
    var m = msgs[i],
      txt = m.querySelector(".txt"),
      full = texts[i];
    if (reduce) {
      m.classList.add("is-shown");
      done();
      return;
    }
    typing.classList.add("is-on");
    body.appendChild(typing);
    body.appendChild(options);
    toBottom();
    later(
      function () {
        typing.classList.remove("is-on");
        txt.textContent = "";
        m.classList.add("is-shown");
        var k = 0;
        var step = behind > 0 ? 6 : 26;
        (function type() {
          if (dead) return;
          k = Math.min(full.length, k + (behind > 1 ? 3 : 1));
          txt.textContent = full.slice(0, k);
          var ch = full.charAt(k - 1);
          if (ch !== " " || Math.random() < 0.6) tick(ch === " ");
          toBottom();
          if (k < full.length) later(type, step + (ch === "," || ch === "." ? step * 4 : Math.random() * step));
          else done();
        })();
      },
      i === 0 ? 500 : behind > 0 ? 250 : 650 + Math.min(900, full.length * 6)
    );
    function done() {
      busy = false;
      if (shown >= msgs.length) finish();
      else later(next, 120);
    }
  }

  on(window, "scroll", next, { passive: true });
  on(window, "resize", next, { passive: true });
  ["pointerdown", "keydown", "touchend", "wheel"].forEach(function (ev) {
    on(window, ev, unlock, { passive: true });
  });
  unlock();
  next();

  // ---------------------------------------------------------------- taskbar clock
  function time() {
    if (!clock) return;
    var d = new Date();
    clock.textContent = ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
  }
  time();
  var iv = setInterval(function () {
    if (dead) clearInterval(iv);
    else time();
  }, 15000);
})();
