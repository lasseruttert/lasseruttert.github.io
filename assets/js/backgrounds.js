/*
 * Procedural page backgrounds: glass blocks, persian rug, painted tiles.
 *
 * The background covers the whole page and scrolls with it. Content sections
 * (.slot) are snapped to its grid and become part of it: milky glass plates,
 * woven cartouches, large tiles. A WebGL2 fragment shader draws the visible part
 * each frame from small textures (a block index, foliage, a tile atlas, the rug's
 * knot colours). Without WebGL2 the sections fall back to plain panels.
 */
(function () {
  "use strict";

  var canvas = document.getElementById("bg-canvas");
  if (!canvas) return;
  var kind = canvas.getAttribute("data-bg");

  // ---------------------------------------------------------------- utilities
  function mulberry32(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var R = mulberry32(1);
  function rnd(a, b) {
    return a + (b - a) * R();
  }
  function pick(arr) {
    return arr[Math.floor(R() * arr.length)];
  }
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }
  function makeCanvas(w, h) {
    var c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }
  var TAU = Math.PI * 2;
  var supportsFilter = (function () {
    var c = makeCanvas(1, 1).getContext("2d");
    return typeof c.filter === "string";
  })();

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Fine grain noise tile used by all three textures.
  function noiseTile(size, alpha, streak) {
    var c = makeCanvas(size, size);
    var g = c.getContext("2d");
    var img = g.createImageData(size, size);
    for (var i = 0; i < img.data.length; i += 4) {
      var v = Math.floor(R() * 255);
      if (streak) {
        // horizontal weave for wool
        var row = Math.floor(i / 4 / size);
        v = clamp(v * 0.6 + (row % 2 ? 60 : 0), 0, 255);
      }
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = Math.floor(R() * alpha);
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // ============================================================ GLASS BLOCKS
  // --- foliage: three depth layers of branches with real leaf shapes
  function drawLeaf(g, L, hue, sat, light, detail) {
    var w = L * rnd(0.3, 0.44);
    var bend = rnd(-0.15, 0.15) * L;
    var grad = g.createLinearGradient(-w, 0, w, 0);
    grad.addColorStop(0, "hsl(" + hue + "," + sat + "%," + clamp(light + 9, 0, 90) + "%)");
    grad.addColorStop(0.5, "hsl(" + hue + "," + sat + "%," + light + "%)");
    grad.addColorStop(1, "hsl(" + hue + "," + sat + "%," + clamp(light - 8, 0, 90) + "%)");
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(w * 1.05, L * 0.18, w * 0.75 + bend, L * 0.72, bend, L);
    g.bezierCurveTo(-w * 0.75 + bend, L * 0.72, -w * 1.05, L * 0.18, 0, 0);
    g.fill();
    if (!detail) return;
    var rib = "hsla(" + (hue - 10) + "," + (sat - 10) + "%," + clamp(light + 20, 0, 92) + "%,0.55)";
    g.strokeStyle = rib;
    g.lineWidth = Math.max(0.6, L * 0.022);
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(bend * 0.4, L * 0.5, bend, L * 0.96);
    g.stroke();
    g.lineWidth = Math.max(0.4, L * 0.01);
    for (var t = 0.18; t < 0.85; t += 0.13) {
      var vx = bend * t * t,
        vy = L * t,
        reach = w * 0.78 * Math.sin(Math.PI * Math.min(1, t + 0.1));
      for (var s = -1; s <= 1; s += 2) {
        g.beginPath();
        g.moveTo(vx, vy);
        g.quadraticCurveTo(vx + s * reach * 0.5, vy + L * 0.04, vx + s * reach, vy + L * 0.13);
        g.stroke();
      }
    }
  }

  function drawBranch(g, x, y, len, ang, leafL, layer) {
    var steps = Math.max(3, Math.round(len / (leafL * 0.45)));
    var seg = len / steps;
    var curve = rnd(-0.05, 0.05);
    g.strokeStyle = layer.twig;
    g.lineWidth = Math.max(0.8, leafL * 0.06);
    g.beginPath();
    g.moveTo(x, y);
    var pts = [];
    for (var i = 0; i < steps; i++) {
      ang += curve + rnd(-0.08, 0.08);
      x += Math.cos(ang) * seg;
      y += Math.sin(ang) * seg;
      g.lineTo(x, y);
      pts.push([x, y, ang]);
    }
    g.stroke();
    pts.forEach(function (p, i) {
      var side = i % 2 ? 1 : -1;
      var sz = leafL * rnd(0.75, 1.15) * (0.7 + 0.3 * (i / steps));
      var sunlit = R() < layer.sunny;
      g.save();
      g.translate(p[0], p[1]);
      g.rotate(p[2] - Math.PI / 2 + side * rnd(0.6, 1.1));
      drawLeaf(
        g,
        sz,
        sunlit ? rnd(70, 95) : rnd(95, 135),
        sunlit ? rnd(45, 65) : rnd(28, 52),
        sunlit ? rnd(40, 58) : layer.light + rnd(-6, 8),
        layer.detail
      );
      g.restore();
    });
    // terminal leaf
    var last = pts[pts.length - 1];
    g.save();
    g.translate(last[0], last[1]);
    g.rotate(last[2] - Math.PI / 2);
    drawLeaf(g, leafL * 1.1, rnd(95, 130), 40, layer.light + 4, layer.detail);
    g.restore();
  }

  // ============================================================ PERSIAN RUG
  var RUG = {
    red: "#5c1416",
    red2: "#7a1d20",
    burgundy: "#3a0c0f",
    rose: "#b0574c",
    orange: "#a8573a",
    navy: "#161a2c",
    navy2: "#2a3150",
    ivory: "#e9dcc0",
    gold: "#bf9152",
    green: "#55613f",
    blue: "#3e5470",
    pink: "#b0574c",
    ink: "#120909",
    panel: "#6c1a1c",
    lozenge: "#8a2b24",
  };
  var RUG_PALETTES = [
    {},
    // indigo ground with madder and ivory
    { red: "#1b2140", red2: "#7a1d20", burgundy: "#3a0c0f", panel: "#262d52", lozenge: "#5c1416", navy: "#0f1224", rose: "#b0574c" },
    // camel ground with indigo
    { red: "#5a3a22", red2: "#7a1d20", burgundy: "#2a1a10", panel: "#6b4629", lozenge: "#1f2a4d", navy: "#161a2c", rose: "#c0705a" },
  ];
  function withPalette(i, fn) {
    var saved = {};
    var pal = RUG_PALETTES[i % RUG_PALETTES.length];
    Object.keys(pal).forEach(function (k) {
      saved[k] = RUG[k];
      RUG[k] = pal[k];
    });
    try {
      fn();
    } finally {
      Object.keys(saved).forEach(function (k) {
        RUG[k] = saved[k];
      });
    }
  }

  function petalPath(ctx, len, wid) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(wid, len * 0.5, 0, len);
    ctx.quadraticCurveTo(-wid, len * 0.5, 0, 0);
    ctx.closePath();
  }

  function rosette(ctx, x, y, r, n, cOut, cIn, cCenter) {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineWidth = Math.max(0.8, r * 0.06);
    ctx.strokeStyle = RUG.ink;
    for (var layer = 0; layer < 2; layer++) {
      var rr = layer === 0 ? r : r * 0.62;
      ctx.fillStyle = layer === 0 ? cOut : cIn;
      for (var i = 0; i < n; i++) {
        ctx.save();
        ctx.rotate((i / n) * TAU + (layer ? Math.PI / n : 0));
        petalPath(ctx, rr, rr * 0.42);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.fillStyle = cCenter;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.22, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function palmette(ctx, x, y, s, ang, c1, c2) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.lineWidth = Math.max(0.8, s * 0.05);
    ctx.strokeStyle = RUG.ink;
    var layers = [
      [1, c1],
      [0.7, c2],
      [0.42, c1],
    ];
    layers.forEach(function (l) {
      var k = l[0] * s;
      ctx.fillStyle = l[1];
      ctx.beginPath();
      ctx.moveTo(0, -k);
      ctx.bezierCurveTo(k * 0.9, -k * 0.5, k * 0.8, k * 0.6, 0, k * 0.5);
      ctx.bezierCurveTo(-k * 0.8, k * 0.6, -k * 0.9, -k * 0.5, 0, -k);
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  }

  function leaf(ctx, x, y, s, ang, col) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.fillStyle = col;
    ctx.strokeStyle = RUG.ink;
    ctx.lineWidth = Math.max(0.6, s * 0.06);
    petalPath(ctx, s, s * 0.35);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function lobed(ctx, cx, cy, rx, ry, lobes, depth) {
    ctx.beginPath();
    var steps = 360;
    for (var i = 0; i <= steps; i++) {
      var t = (i / steps) * TAU;
      var k = 1 + depth * Math.abs(Math.cos((t * lobes) / 2));
      var px = cx + Math.cos(t) * rx * k,
        py = cy + Math.sin(t) * ry * k;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function star(ctx, cx, cy, r1, r2, n, rot) {
    ctx.beginPath();
    for (var i = 0; i < n * 2; i++) {
      var r = i % 2 ? r2 : r1;
      var a = (i / (n * 2)) * TAU + (rot || 0);
      var px = cx + Math.cos(a) * r,
        py = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  // ---------------------------------------------------------------- Heriz-style rug
  // Angular, stepped geometry: a rose medallion on a rust field, stepped corner
  // spandrels, scattered small motifs, and a burgundy main border with rosettes.

  // a diamond whose edges climb in stair steps
  function steppedPath(ctx, cx, cy, rx, ry, n) {
    // one quadrant, from the top point down to the right point
    var P = [[0, -ry]];
    for (var k = 0; k < n; k++) {
      var x1 = (rx * (k + 1)) / n,
        y0 = -ry + (ry * k) / n,
        y1 = -ry + (ry * (k + 1)) / n;
      P.push([x1, y0], [x1, y1]);
    }
    var R2 = P.slice().reverse();
    var pts = []
      .concat(P)
      .concat(
        R2.map(function (q) {
          return [q[0], -q[1]];
        })
      )
      .concat(
        P.map(function (q) {
          return [-q[0], -q[1]];
        })
      )
      .concat(
        R2.map(function (q) {
          return [-q[0], q[1]];
        })
      );
    ctx.beginPath();
    pts.forEach(function (q, i) {
      if (i === 0) ctx.moveTo(cx + q[0], cy + q[1]);
      else ctx.lineTo(cx + q[0], cy + q[1]);
    });
    ctx.closePath();
  }
  function fillStepped(ctx, cx, cy, rx, ry, n, fill, line) {
    steppedPath(ctx, cx, cy, rx, ry, n);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = line || RUG.ink;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  // small angular flower: a stepped cross with a centre
  function crossFlower(ctx, x, y, s, c1, c2) {
    ctx.fillStyle = c1;
    ctx.fillRect(x - s, y - s * 0.34, s * 2, s * 0.68);
    ctx.fillRect(x - s * 0.34, y - s, s * 0.68, s * 2);
    ctx.fillStyle = c2;
    ctx.fillRect(x - s * 0.34, y - s * 0.34, s * 0.68, s * 0.68);
  }
  function sprig(ctx, x, y, s, ang, col) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(1.5, s * 0.12);
    ctx.beginPath();
    ctx.moveTo(0, s);
    ctx.lineTo(0, -s);
    for (var t = -0.6; t <= 0.6; t += 0.6) {
      ctx.moveTo(0, s * t);
      ctx.lineTo(s * 0.5, s * (t - 0.4));
      ctx.moveTo(0, s * t);
      ctx.lineTo(-s * 0.5, s * (t - 0.4));
    }
    ctx.stroke();
    ctx.restore();
  }

  // stepped rose spandrel in a field corner; dx, dy point into the field
  function spandrel(ctx, x, y, dx, dy, sx, sy, n) {
    function path(k1) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + dx * sx * k1, y);
      for (var k = 1; k <= n; k++) {
        ctx.lineTo(x + dx * sx * k1 * (1 - k / n), y + dy * sy * k1 * ((k - 1) / n));
        ctx.lineTo(x + dx * sx * k1 * (1 - k / n), y + dy * sy * k1 * (k / n));
      }
      ctx.closePath();
    }
    path(1.03);
    ctx.fillStyle = RUG.navy;
    ctx.fill();
    path(1.0);
    ctx.fillStyle = RUG.ivory;
    ctx.fill();
    path(0.97);
    ctx.fillStyle = RUG.rose;
    ctx.fill();
  }

  // ---------------------------------------------------------------- rich Heriz rug
  // Angular medallion and corners, filled with dense curvilinear ornament. Small
  // ornaments are never placed where a line of text runs, so the ground colour
  // continues behind the letters and the pattern ends at its own motifs.

  function inStepped(dx, dy, rx, ry, n) {
    var ax = Math.abs(dx) / rx,
      ay = Math.abs(dy) / ry;
    if (ax >= 1) return false;
    return ay <= 1 - Math.floor(ax * n) / n;
  }
  function inSpandrel(x, y, x0, y0, dx, dy, sx, sy, n) {
    var u = ((x - x0) * dx) / sx,
      v = ((y - y0) * dy) / sy;
    if (u < 0 || v < 0 || u > 1 || v > 1) return false;
    return v <= Math.floor((1 - u) * n) / n;
  }

  // a curling vine scroll with leaves, the backbone of Persian floral fields
  function scroll(ctx, x, y, s, ang, col, leafCol) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(1.6, s * 0.08);
    ctx.beginPath();
    ctx.moveTo(-s, 0);
    ctx.bezierCurveTo(-s * 0.4, -s * 0.9, s * 0.4, s * 0.9, s, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(s * 0.82, -s * 0.22, s * 0.22, Math.PI * 0.5, Math.PI * 2.2);
    ctx.stroke();
    ctx.restore();
    leaf(ctx, x + Math.cos(ang) * -s * 0.45, y + Math.sin(ang) * -s * 0.45, s * 0.42, ang - 2.4, leafCol);
    leaf(ctx, x + Math.cos(ang) * s * 0.35, y + Math.sin(ang) * s * 0.35, s * 0.42, ang + 0.7, leafCol);
  }

  // one small ornament, chosen by t in [0,1)
  function ornament(ctx, x, y, s, t, pal) {
    if (t < 0.24) rosette(ctx, x, y, s * 0.55, t < 0.12 ? 8 : 6, pal[0], pal[1], pal[2]);
    else if (t < 0.4) palmette(ctx, x, y, s * 0.5, t * 40, pal[0], pal[1]);
    else if (t < 0.56) scroll(ctx, x, y, s * 0.75, t * 30, pal[3], pal[4]);
    else if (t < 0.68) boteh(ctx, x, y, s * 0.8, t < 0.62 ? 1 : -1, Math.floor(t * 30) % 3);
    else if (t < 0.8) {
      leaf(ctx, x - s * 0.15, y, s * 0.55, -2.3, pal[4]);
      leaf(ctx, x + s * 0.15, y, s * 0.55, 2.3, pal[4]);
      rosette(ctx, x, y - s * 0.1, s * 0.26, 6, pal[1], pal[0], pal[2]);
    } else if (t < 0.9) sprig(ctx, x, y, s * 0.55, t * 20, pal[3]);
    else crossFlower(ctx, x, y, s * 0.3, pal[0], pal[2]);
  }

  // ---------------------------------------------------------------- filigree rug
  // Sigil-like filigree: tapering curls that tighten into spirals, mirrored
  // flourishes, rayed compass sigils with beads, and an ivory lace medallion on a
  // deep red ground.

  // points of a stroke whose curvature grows along its length, so it curls up at the end
  function curlPts(x, y, ang, s, sg, tight) {
    var pts = [];
    var n = 34,
      ds = s / n;
    for (var i = 0; i <= n; i++) {
      var t = i / n;
      pts.push([x, y, ang, t]);
      ang += (sg * (0.7 + (tight || 7) * t * t) * ds) / s;
      x += Math.cos(ang) * ds;
      y += Math.sin(ang) * ds;
    }
    return pts;
  }
  // fill a stroke that tapers from w0 to w1: one polygon, cheap to draw
  var THICK = 2;
  function taper(ctx, pts, w0, w1, col) {
    var L = [],
      Rr = [];
    pts.forEach(function (p) {
      var w = ((w0 + (w1 - w0) * p[3]) * THICK) / 2;
      var nx = -Math.sin(p[2]),
        ny = Math.cos(p[2]);
      L.push([p[0] + nx * w, p[1] + ny * w]);
      Rr.push([p[0] - nx * w, p[1] - ny * w]);
    });
    ctx.beginPath();
    ctx.moveTo(L[0][0], L[0][1]);
    for (var i = 1; i < L.length; i++) ctx.lineTo(L[i][0], L[i][1]);
    for (i = Rr.length - 1; i >= 0; i--) ctx.lineTo(Rr[i][0], Rr[i][1]);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
  }
  function bead(ctx, x, y, r, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x, y, r * (1 + (THICK - 1) * 0.6), 0, TAU);
    ctx.fill();
  }
  // a curl with smaller curls sprouting from it (one level deep)
  function curl(ctx, x, y, ang, s, sg, w, col, depth) {
    var pts = curlPts(x, y, ang, s, sg, 7);
    taper(ctx, pts, w, w * 0.15, col);
    var end = pts[pts.length - 1];
    bead(ctx, end[0], end[1], w * 0.45, col);
    if (depth > 0) {
      [0.32, 0.58].forEach(function (at, k) {
        var p = pts[Math.round(at * (pts.length - 1))];
        curl(ctx, p[0], p[1], p[2] - sg * (0.9 + k * 0.3), s * (0.42 - k * 0.1), -sg, w * 0.7, col, depth - 1);
      });
      // a thorn on the outside of the bend
      var tp = pts[Math.round(0.45 * (pts.length - 1))];
      var ta = tp[2] + sg * 1.6;
      taper(ctx, curlPts(tp[0], tp[1], ta, s * 0.16, 0, 0), w * 0.8, 0.2, col);
    }
  }
  // mirrored pair of curls about a vertical (or rotated) axis: the basic flourish
  function flourish(ctx, x, y, s, axis, col, w) {
    w = w || Math.max(3, s * 0.1);
    curl(ctx, x, y, axis - 0.5, s, 1, w, col, 1);
    curl(ctx, x, y, axis + Math.PI + 0.5, s, -1, w, col, 1);
    bead(ctx, x, y, w * 0.9, col);
  }
  // a long tapered spike with beads and a diamond tip
  function spike(ctx, x, y, ang, len, w, col) {
    var pts = [];
    for (var i = 0; i <= 10; i++) pts.push([x + Math.cos(ang) * len * (i / 10), y + Math.sin(ang) * len * (i / 10), ang, i / 10]);
    taper(ctx, pts, w, 0.4, col);
    for (var b = 1; b <= 3; b++) bead(ctx, x + Math.cos(ang) * len * (0.25 * b), y + Math.sin(ang) * len * (0.25 * b), w * (0.9 - b * 0.15), col);
    var tx = x + Math.cos(ang) * len,
      ty = y + Math.sin(ang) * len;
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(ang);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(w * 2.2, 0);
    ctx.lineTo(0, w * 1.1);
    ctx.lineTo(-w * 1.2, 0);
    ctx.lineTo(0, -w * 1.1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // compass sigil: rays, a beaded double ring, flourishes round it, a fine star in the middle
  function sigil(ctx, cx, cy, R, col, col2) {
    var w = Math.max(2.4, R * 0.06);
    for (var a = 0; a < 8; a++) {
      var ang = (a / 8) * TAU - Math.PI / 2;
      spike(ctx, cx + Math.cos(ang) * R * 0.7, cy + Math.sin(ang) * R * 0.7, ang, R * (a % 2 ? 0.55 : 1.0), w, col);
    }
    ctx.strokeStyle = col;
    ctx.lineWidth = w * THICK;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.62, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = w * 0.6 * THICK;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.52, 0, TAU);
    ctx.stroke();
    for (a = 0; a < 16; a++) {
      var ba = (a / 16) * TAU;
      bead(ctx, cx + Math.cos(ba) * R * 0.57, cy + Math.sin(ba) * R * 0.57, w * 0.7, col2 || col);
    }
    for (a = 0; a < 4; a++) {
      var fa = (a / 4) * TAU + Math.PI / 4;
      flourish(ctx, cx + Math.cos(fa) * R * 0.7, cy + Math.sin(fa) * R * 0.7, R * 0.32, fa + Math.PI / 2, col, w * 0.8);
    }
    for (a = 0; a < 8; a++) {
      var sa = (a / 8) * TAU;
      var len = a % 2 ? R * 0.22 : R * 0.42;
      ctx.fillStyle = col2 || col;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(sa) * len, cy + Math.sin(sa) * len);
      ctx.lineTo(cx + Math.cos(sa + 0.25) * R * 0.08, cy + Math.sin(sa + 0.25) * R * 0.08);
      ctx.lineTo(cx + Math.cos(sa - 0.25) * R * 0.08, cy + Math.sin(sa - 0.25) * R * 0.08);
      ctx.closePath();
      ctx.fill();
    }
  }
  // the ivory lace medallion of a filigree rug
  function laceMedallion(ctx, cx, cy, rx, ry, free) {
    // finials: spikes and small sigils on the long axis
    [-1, 1].forEach(function (sg) {
      spike(ctx, cx, cy + sg * ry * 1.02, (sg * Math.PI) / 2, ry * 0.42, Math.max(2, rx * 0.025), RUG.ivory);
      sigil(ctx, cx, cy + sg * ry * 1.2, rx * 0.16, RUG.ivory, RUG.gold);
    });
    ctx.fillStyle = RUG.ink;
    lobed(ctx, cx, cy, rx * 1.04, ry * 1.03, 22, 0.07);
    ctx.fill();
    ctx.fillStyle = RUG.ivory;
    lobed(ctx, cx, cy, rx, ry, 22, 0.07);
    ctx.fill();
    // lace: dense dark-red filigree over the ivory
    var inside = function (x, y) {
      var dx = (x - cx) / (rx * 0.92),
        dy = (y - cy) / (ry * 0.92);
      var d2 = dx * dx + dy * dy;
      return d2 < 1 && d2 > 0.3;
    };
    for (var yy = cy - ry; yy < cy + ry; yy += 22) {
      for (var xx = cx - rx + ((yy / 22) % 2 ? 11 : 0); xx < cx + rx; xx += 22) {
        var jx = xx + rnd(-5, 5),
          jy = yy + rnd(-5, 5);
        if (!inside(jx, jy) || !free(jx, jy, 18)) continue;
        var ax = Math.atan2(jy - cy, jx - cx);
        flourish(ctx, jx, jy, rnd(24, 32), ax + Math.PI / 2, R() < 0.85 ? RUG.red2 : RUG.navy, 3.4);
      }
    }
    // inner red star with ivory filigree
    ctx.fillStyle = RUG.ink;
    star(ctx, cx, cy, Math.min(rx, ry) * 0.62, Math.min(rx, ry) * 0.42, 8, Math.PI / 8);
    ctx.fill();
    ctx.fillStyle = RUG.red2;
    star(ctx, cx, cy, Math.min(rx, ry) * 0.58, Math.min(rx, ry) * 0.39, 8, Math.PI / 8);
    ctx.fill();
    var rs = Math.min(rx, ry);
    for (var a = 0; a < 8; a++) {
      var ang = (a / 8) * TAU;
      if (free(cx + Math.cos(ang) * rs * 0.4, cy + Math.sin(ang) * rs * 0.4, 14))
        flourish(ctx, cx + Math.cos(ang) * rs * 0.4, cy + Math.sin(ang) * rs * 0.4, rs * 0.2, ang + Math.PI / 2, RUG.ivory, 3.2);
    }
    if (free(cx, cy, rs * 0.25)) sigil(ctx, cx, cy, rs * 0.26, RUG.ivory, RUG.gold);
  }
  // quarter lace in a field corner
  function laceCorner(ctx, x, y, dx, dy, r, free) {
    ctx.fillStyle = RUG.ink;
    lobed(ctx, x, y, r * 1.04, r * 1.04, 14, 0.07);
    ctx.fill();
    ctx.fillStyle = RUG.ivory;
    lobed(ctx, x, y, r, r, 14, 0.07);
    ctx.fill();
    for (var yy = 0; yy < r; yy += 22) {
      for (var xx = 0; xx < r; xx += 22) {
        var px = x + dx * (xx + rnd(4, 16)),
          py = y + dy * (yy + rnd(4, 16));
        if (Math.hypot(px - x, py - y) > r * 0.9 || !free(px, py, 18)) continue;
        flourish(ctx, px, py, rnd(22, 30), Math.atan2(py - y, px - x) + Math.PI / 2, RUG.red2, 3.4);
      }
    }
    if (free(x + dx * r * 0.22, y + dy * r * 0.22, r * 0.18)) sigil(ctx, x + dx * r * 0.22, y + dy * r * 0.22, r * 0.18, RUG.red2, RUG.navy);
  }

  // ---------------------------------------------------------------- the overarching filigree
  // One composition for the whole rug: a central spine with a crown and a dagger
  // point, huge mirrored branches that keep branching into curls, and large sigil
  // rings whose spikes reach across the field.

  // grow a branch: a curl, with smaller curls sprouting from it, recursively
  function grow(list, x, y, ang, s, sg, w, depth, col) {
    var pts = curlPts(x, y, ang, s, sg, 8.5);
    list.push({ pts: pts, w0: w, w1: w * 0.14, col: col });
    var end = pts[pts.length - 1];
    list.push({ bead: [end[0], end[1], w * 0.55], col: col });
    if (depth <= 0) return;
    var at = [0.2, 0.42, 0.64];
    at.forEach(function (t, k) {
      var p = pts[Math.round(t * (pts.length - 1))];
      var side = k % 2 ? sg : -sg;
      var childCol = depth === 1 && k === 1 ? RUG.gold : col;
      grow(list, p[0], p[1], p[2] - side * (0.95 + 0.15 * k), s * (0.5 - k * 0.09), side, w * 0.66, depth - 1, childCol);
    });
    // thorns and a leaf-like spur on the outer side
    [0.3, 0.55].forEach(function (t) {
      var p = pts[Math.round(t * (pts.length - 1))];
      var ta = p[2] + sg * 1.5;
      var tp = [];
      for (var i = 0; i <= 6; i++) tp.push([p[0] + Math.cos(ta) * s * 0.12 * (i / 6), p[1] + Math.sin(ta) * s * 0.12 * (i / 6), ta, i / 6]);
      list.push({ pts: tp, w0: w * 0.7, w1: 0.3, col: col });
    });
  }
  function drawList(ctx, list) {
    list.forEach(function (it) {
      if (it.bead) bead(ctx, it.bead[0], it.bead[1], it.bead[2], it.col);
      else taper(ctx, it.pts, it.w0, it.w1, it.col);
    });
  }
  // draw a list and its mirror image about the vertical axis x = cx
  function drawMirrored(ctx, list, cx) {
    drawList(ctx, list);
    ctx.save();
    ctx.translate(2 * cx, 0);
    ctx.scale(-1, 1);
    drawList(ctx, list);
    ctx.restore();
  }
  // a large sigil ring: double beaded ring, an inner ring of flourishes, a compass star, long spikes
  function bigSigil(ctx, cx, cy, R, reach) {
    var w = Math.max(4, R * 0.04);
    for (var a = 0; a < 8; a++) {
      var ang = (a / 8) * TAU - Math.PI / 2;
      var len = a % 2 ? reach * 0.32 : reach;
      spike(ctx, cx + Math.cos(ang) * R * 1.02, cy + Math.sin(ang) * R * 1.02, ang, len, w * 1.1, a % 2 ? RUG.gold : RUG.ivory);
    }
    ctx.strokeStyle = RUG.ivory;
    ctx.lineWidth = w * 1.2 * THICK;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = w * 0.6 * THICK;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.86, 0, TAU);
    ctx.stroke();
    for (a = 0; a < 28; a++) {
      var ba = (a / 28) * TAU;
      bead(ctx, cx + Math.cos(ba) * R * 0.93, cy + Math.sin(ba) * R * 0.93, w * 0.75, a % 2 ? RUG.gold : RUG.ivory);
    }
    for (a = 0; a < 8; a++) {
      var fa = (a / 8) * TAU;
      flourish(ctx, cx + Math.cos(fa) * R * 0.6, cy + Math.sin(fa) * R * 0.6, R * 0.26, fa + Math.PI / 2, RUG.ivory, w * 0.9);
    }
    sigil(ctx, cx, cy, R * 0.34, RUG.gold, RUG.ivory);
  }

  // One composition for the whole rug, generated on the right half and mirrored.
  // Pass "blocks" lays the large colour fields (none of which touch); pass "lines"
  // grows the filigree, pruning any curl that would cross something already drawn.
  // st carries shared state between the passes: block ellipses, the occupancy
  // grid, and shapes reserved in advance (the lace corners).
  function overarching(ctx, fx, fy, fw, fh, cx, mode, st) {
    var reach = fw * 0.47;
    var topH = Math.max(fh * 0.12, 420);
    var span = fh - topH - fh * 0.08;
    var nodes = Math.max(2, Math.round(span / 480));
    var nodeGap = span / nodes;
    var ringR = Math.min(reach * 0.4, 180);
    function nodeY(n) {
      return fy + topH + nodeGap * (n + 0.5);
    }
    function edgeY(e) {
      return fy + topH + nodeGap * e;
    }
    function ellHit(x, y, rx, ry, pad) {
      return st.blocks.some(function (b) {
        var dx = (x - b.x) / (b.rx + rx + pad),
          dy = (y - b.y) / (b.ry + ry + pad);
        return dx * dx + dy * dy < 1;
      });
    }
    function place(x, y, rx, ry, draw) {
      if (ellHit(x, y, rx, ry, 12)) return false;
      st.blocks.push({ x: x, y: y, rx: rx, ry: ry });
      draw();
      return true;
    }

    if (mode === "blocks") {
      st.reserved.forEach(function (c) {
        st.blocks.push({ x: c.x, y: c.y, rx: c.r, ry: c.r });
      });
      // one large lighter ground behind the whole composition
      ctx.fillStyle = RUG.ink;
      roundRect(ctx, fx + fw * 0.06 - 5, fy + fh * 0.025 - 5, fw * 0.88 + 10, fh * 0.95 + 10, 70);
      ctx.fill();
      ctx.fillStyle = RUG.panel;
      roundRect(ctx, fx + fw * 0.06, fy + fh * 0.025, fw * 0.88, fh * 0.95, 64);
      ctx.fill();
      // rings first, then the spine medallions sized to the space left between them
      for (var pass = 0; pass < 2; pass++)
        for (var bn = 0; bn < nodes; bn++) {
          var by = nodeY(bn);
          if ((bn % 2 === 1) !== (pass === 0)) continue;
          if (bn % 2 === 1) {
            place(cx, by, ringR * 1.16, ringR * 1.16, function () {
              ctx.fillStyle = RUG.ink;
              ctx.beginPath();
              ctx.arc(cx, by, ringR * 1.14, 0, TAU);
              ctx.fill();
              ctx.fillStyle = RUG.rose;
              ctx.beginPath();
              ctx.arc(cx, by, ringR * 1.1, 0, TAU);
              ctx.fill();
              ctx.fillStyle = RUG.navy;
              ctx.beginPath();
              ctx.arc(cx, by, ringR * 0.97, 0, TAU);
              ctx.fill();
            });
            var sx = cx + reach * 0.74;
            if (
              !ellHit(sx, by, reach * 0.09, reach * 0.13, 12) &&
              !st.textHit(sx, by, reach * 0.12, reach * 0.14) &&
              !st.textHit(2 * cx - sx, by, reach * 0.12, reach * 0.14)
            ) {
              st.blocks.push({ x: sx, y: by, rx: reach * 0.09, ry: reach * 0.13 });
              st.blocks.push({ x: 2 * cx - sx, y: by, rx: reach * 0.09, ry: reach * 0.13 });
              palmette(ctx, sx, by, reach * 0.1, Math.PI / 2, RUG.gold, RUG.navy);
              palmette(ctx, 2 * cx - sx, by, reach * 0.1, -Math.PI / 2, RUG.gold, RUG.navy);
            }
          } else {
            var lrx = reach * 0.86,
              lry = clamp(nodeGap - ringR * 1.16 - 22, nodeGap * 0.36, nodeGap * 0.62);
            place(cx, by, lrx, lry, function () {
              ctx.fillStyle = RUG.ink;
              lobed(ctx, cx, by, lrx, lry, 18, 0.07);
              ctx.fill();
              ctx.fillStyle = RUG.lozenge;
              lobed(ctx, cx, by, lrx * 0.97, lry * 0.96, 18, 0.07);
              ctx.fill();
              // a rose heart with an ink edge inside the medallion
              ctx.fillStyle = RUG.ink;
              lobed(ctx, cx, by, lrx * 0.48, lry * 0.52, 12, 0.1);
              ctx.fill();
              ctx.fillStyle = RUG.rose;
              lobed(ctx, cx, by, lrx * 0.45, lry * 0.49, 12, 0.1);
              ctx.fill();
              // nested inside the medallion, so they belong to it
              function pal(x, y, sz, ang, c1, c2) {
                if (!st.textHit(x, y, sz * 1.1, sz * 1.1)) palmette(ctx, x, y, sz, ang, c1, c2);
              }
              pal(cx, by - lry * 0.22, reach * 0.16, 0, RUG.navy, RUG.ivory);
              pal(cx, by + lry * 0.3, reach * 0.11, Math.PI, RUG.navy, RUG.gold);
              [-1, 1].forEach(function (sg) {
                pal(cx + sg * lrx * 0.7, by, reach * 0.12, (sg * Math.PI) / 2, RUG.gold, RUG.navy);
              });
            });
          }
        }
      for (var ee = 0; ee <= nodes; ee++) {
        var eyy = edgeY(ee);
        var rx = reach * 0.26,
          ry = nodeGap * 0.3;
        if (ellHit(fx + fw, eyy, rx, ry, 12) || st.textHit(fx, eyy, rx, ry) || st.textHit(fx + fw, eyy, rx, ry)) continue;
        st.blocks.push({ x: fx + fw, y: eyy, rx: rx, ry: ry });
        st.blocks.push({ x: fx, y: eyy, rx: rx, ry: ry });
        [fx, fx + fw].forEach(function (ex) {
          ctx.fillStyle = RUG.ink;
          lobed(ctx, ex, eyy, rx, ry, 12, 0.1);
          ctx.fill();
          ctx.fillStyle = ee % 2 ? RUG.navy : RUG.rose;
          lobed(ctx, ex, eyy, rx * 0.93, ry * 0.93, 12, 0.1);
          ctx.fill();
          ctx.fillStyle = ee % 2 ? RUG.rose : RUG.navy;
          lobed(ctx, ex, eyy, rx * 0.5, ry * 0.5, 10, 0.1);
          ctx.fill();
        });
      }
      [
        [fy + topH * 0.52, reach * 0.62, topH * 0.36],
        [fy + fh * 0.93, reach * 0.26, Math.min(fh * 0.045, 110)],
      ].forEach(function (spec) {
        var yy = spec[0],
          lr = spec[1],
          lh = spec[2];
        place(cx, yy, lr, lh, function () {
          ctx.fillStyle = RUG.ink;
          lobed(ctx, cx, yy, lr, lh, 12, 0.1);
          ctx.fill();
          ctx.fillStyle = RUG.rose;
          lobed(ctx, cx, yy, lr * 0.94, lh * 0.92, 12, 0.1);
          ctx.fill();
          if (lh > 120) {
            ctx.fillStyle = RUG.ink;
            lobed(ctx, cx, yy, lr * 0.5, lh * 0.52, 10, 0.1);
            ctx.fill();
            ctx.fillStyle = RUG.navy;
            lobed(ctx, cx, yy, lr * 0.47, lh * 0.49, 10, 0.1);
            ctx.fill();
          }
        });
      });
      return;
    }

    // ---- lines: occupancy grid over the right half (x >= cx)
    var CS = 6;
    var cells = st.cells;
    var uid = 1;
    function ck(x, y) {
      return Math.floor(x / CS) + "," + Math.floor(y / CS);
    }
    function around(p, r, fn) {
      var r2 = Math.ceil(r / CS);
      var bx = Math.floor(p[0] / CS),
        byy = Math.floor(p[1] / CS);
      for (var dy = -r2; dy <= r2; dy++) for (var dx = -r2; dx <= r2; dx++) if (fn(bx + dx + "," + (byy + dy)) === false) return false;
      return true;
    }
    function mark(pts, w, id) {
      pts.forEach(function (p) {
        around(p, w / 2 + 2, function (k) {
          if (!cells[k]) cells[k] = id;
        });
      });
    }
    function clear(pts, w, from, parent) {
      for (var i = Math.floor(from * (pts.length - 1)); i < pts.length; i++) {
        var p = pts[i];
        if (p[0] < cx - 2 || p[0] > fx + fw - 4 || p[1] < fy + 4 || p[1] > fy + fh - 4) return false;
        var ok = around(p, w / 2 + 1, function (k) {
          var o = cells[k];
          return !o || o === parent;
        });
        if (!ok) return false;
      }
      return true;
    }
    function growC(list, x, y, ang, s, sg, w, depth, col, parent) {
      var pts = null;
      for (var tryS = s, tries = 0; tries < 5; tries++, tryS *= 0.75) {
        var cand = curlPts(x, y, ang, tryS, sg, 8.5);
        if (clear(cand, w * THICK, 0.2, parent)) {
          pts = cand;
          s = tryS;
          break;
        }
      }
      if (!pts) return;
      var id = ++uid;
      mark(pts, w * THICK, id);
      list.push({ pts: pts, w0: w, w1: w * 0.14, col: col });
      var end = pts[pts.length - 1];
      list.push({ bead: [end[0], end[1], w * 0.55], col: col });
      if (depth <= 0) return;
      [0.2, 0.42, 0.64].forEach(function (t, k) {
        var p = pts[Math.round(t * (pts.length - 1))];
        var side = k % 2 ? sg : -sg;
        growC(
          list,
          p[0],
          p[1],
          p[2] - side * (0.95 + 0.15 * k),
          s * (0.5 - k * 0.09),
          side,
          w * 0.66,
          depth - 1,
          depth === 1 && k === 1 ? RUG.gold : col,
          id
        );
      });
    }
    function reserveLine(x0, y0, x1, y1, w) {
      var pts = [];
      var n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 5);
      for (var i = 0; i <= n; i++) pts.push([x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
      mark(pts, w, "fixed");
    }
    // ---- kaleidoscopic filigree: grow curls in one wedge, then rotate and reflect it
    // K = {cx, cy, n, rIn, rx, ry, starts:[...]} ; wedge is angles [-PI/n, 0] (y down)
    function kaleido(K) {
      var n = K.n;
      var copies = [];
      for (var k = 0; k < n; k++) {
        var a = (k * TAU) / n;
        copies.push({ c: Math.cos(a), s: Math.sin(a), m: 1 });
        copies.push({ c: Math.cos(a), s: Math.sin(a), m: -1 });
      }
      function toWorld(cp, x, y) {
        var yy = y * cp.m;
        return [K.cx + x * cp.c - yy * cp.s, K.cy + x * cp.s + yy * cp.c];
      }
      var local = {};
      var LC = 6;
      var axA = -Math.PI / n;
      var nx2 = -Math.sin(axA),
        ny2 = Math.cos(axA); // normal of the second mirror line
      function okPt(x, y, half) {
        // inside the wedge, clear of both mirror lines, inside the bounding ellipse, outside the core
        var pad = half + 3 + (K.axisPad || 0);
        if (-y < pad) return false;
        if (n > 1 && x * nx2 + y * ny2 < pad) return false;
        if (Math.hypot(x, y) < K.rIn + half) return false;
        for (var ci = 0; ci < copies.length; ci++) {
          var wp = toWorld(copies[ci], x, y);
          // every rotated copy must stay inside the figure's bounds, not just the wedge itself
          var ex = (wp[0] - K.cx) / K.rx,
            ey = (wp[1] - K.cy) / K.ry;
          if (ex * ex + ey * ey > 1) return false;
          if (wp[0] < fx + 4 || wp[0] > fx + fw - 4) continue;
          if (wp[1] < fy + 4 || wp[1] > fy + fh - 4) return false;
          if (wp[0] < cx - 1) continue;
          var ok = around(wp, half + 1, function (key) {
            return !cells[key];
          });
          if (!ok) return false;
        }
        return true;
      }
      function localFree(pts, half, from, parent) {
        for (var i = Math.floor(from * (pts.length - 1)); i < pts.length; i++) {
          var p = pts[i];
          if (!okPt(p[0], p[1], half)) return false;
          var r2 = Math.ceil((half + 1) / LC);
          var bx = Math.floor(p[0] / LC),
            by = Math.floor(p[1] / LC);
          for (var dy = -r2; dy <= r2; dy++)
            for (var dx = -r2; dx <= r2; dx++) {
              var o = local[bx + dx + "," + (by + dy)];
              if (o && o !== parent) return false;
            }
        }
        return true;
      }
      function localMark(pts, half, id) {
        pts.forEach(function (p) {
          var r2 = Math.ceil((half + 2) / LC);
          var bx = Math.floor(p[0] / LC),
            by = Math.floor(p[1] / LC);
          for (var dy = -r2; dy <= r2; dy++)
            for (var dx = -r2; dx <= r2; dx++) if (!local[bx + dx + "," + (by + dy)]) local[bx + dx + "," + (by + dy)] = id;
        });
      }
      var list = [],
        kid = 1;
      function growK(x, y, ang, s, sg, w, depth, col, parent) {
        var pts = null;
        for (var tryS = s, tries = 0; tries < 8; tries++, tryS *= 0.8) {
          var cand = curlPts(x, y, ang, tryS, sg, 8.5);
          if (localFree(cand, (w * THICK) / 2, parent ? 0.2 : 0, parent)) {
            pts = cand;
            s = tryS;
            break;
          }
        }
        if (!pts) return;
        var id = ++kid;
        localMark(pts, (w * THICK) / 2, id);
        list.push({ pts: pts, w0: w, w1: w * 0.14, col: col });
        var end = pts[pts.length - 1];
        list.push({ bead: [end[0], end[1], w * 0.55], col: col });
        if (depth <= 0) return;
        [0.2, 0.42, 0.64].forEach(function (t, k2) {
          var p = pts[Math.round(t * (pts.length - 1))];
          var side = k2 % 2 ? sg : -sg;
          growK(
            p[0],
            p[1],
            p[2] - side * (0.95 + 0.15 * k2),
            s * (0.5 - k2 * 0.09),
            side,
            w * 0.66,
            depth - 1,
            depth === 1 && k2 === 1 ? RUG.gold : col,
            id
          );
        });
      }
      K.starts.forEach(function (st0) {
        growK(st0.x, st0.y, st0.ang, st0.s, st0.sg, st0.w, st0.depth, st0.col || RUG.ivory, 0);
      });
      // then fill the rest of the wedge with smaller curls on a regular grid
      if (n > 2) {
        var mid = -Math.PI / (2 * n);
        for (var rr = K.rIn + 24, ri = 0; rr < Math.min(K.rx, K.ry) * 0.95; rr += 46, ri++) {
          growK(
            rr * Math.cos(mid),
            rr * Math.sin(mid),
            mid + (ri % 2 ? 0.9 : -0.9),
            70,
            ri % 2 ? -1 : 1,
            5,
            2,
            ri % 3 === 2 ? RUG.gold : RUG.ivory,
            0
          );
        }
      } else {
        for (var gy = 1; gy <= 3; gy++) {
          for (var gx = 1; gx <= 4; gx++) {
            var sx0 = K.rx * (gx / 4.6),
              sy0 = -K.ry * (gy / 3.8);
            var alt = (gx + gy) % 2;
            growK(sx0, sy0, alt ? -0.7 : 0.6, Math.min(K.rx, K.ry) * 0.42, alt ? 1 : -1, 5, 2, (gx * gy) % 3 === 0 ? RUG.gold : RUG.ivory, 0);
          }
        }
      }
      // register every copy in the global grid, then draw them all
      copies.forEach(function (cp) {
        list.forEach(function (it) {
          if (!it.pts) return;
          var wpts = it.pts.map(function (p) {
            return toWorld(cp, p[0], p[1]);
          });
          mark(
            wpts.filter(function (q) {
              return q[0] >= cx - 1;
            }),
            it.w0 * THICK,
            "k"
          );
        });
      });
      return function draw(ctx2, mirrorX) {
        copies.forEach(function (cp) {
          ctx2.save();
          if (mirrorX) {
            ctx2.translate(2 * cx, 0);
            ctx2.scale(-1, 1);
          }
          ctx2.translate(K.cx, K.cy);
          ctx2.transform(cp.c, cp.s, -cp.s * cp.m, cp.c * cp.m, 0, 0);
          ctx2.translate(-K.cx, -K.cy);
          list.forEach(function (it) {
            if (it.bead) bead(ctx2, K.cx + it.bead[0], K.cy + it.bead[1], it.bead[2], it.col);
            else
              taper(
                ctx2,
                it.pts.map(function (p) {
                  return [K.cx + p[0], K.cy + p[1], p[2], p[3]];
                }),
                it.w0,
                it.w1,
                it.col
              );
          });
          ctx2.restore();
        });
      };
    }

    // reserved shapes: lace corners and the spine
    st.reserved.forEach(function (c) {
      if (c.x < cx) return;
      for (var a = 0; a <= 32; a++) {
        var ang = (a / 32) * TAU;
        reserveLine(c.x, c.y, c.x + Math.cos(ang) * c.r, c.y + Math.sin(ang) * c.r, 4);
      }
    });
    reserveLine(cx, fy + fh * 0.04, cx, fy + fh * 0.92, 9 * THICK);

    var lists = [];
    // 1. rings with their spikes
    for (var n = 1; n < nodes; n += 2) {
      var ny = nodeY(n);
      bigSigil(ctx, cx, ny, ringR, reach * 0.95);
      for (var ra = 0; ra <= 24; ra++) {
        var ang2 = (ra / 24) * TAU;
        reserveLine(cx, ny, cx + Math.cos(ang2) * ringR * 1.16, ny + Math.sin(ang2) * ringR * 1.16, 4);
      }
      for (var sk = -2; sk <= 2; sk++) {
        var sa = (sk * Math.PI) / 4;
        var len = Math.abs(sk) % 2 ? reach * 0.32 : reach * 0.95;
        reserveLine(cx, ny, cx + Math.cos(sa) * (ringR + len), ny + Math.sin(sa) * (ringR + len), 6 * THICK);
      }
    }
    var draws = [],
      edgeDraws = [];
    // 3. each sigil ring is wreathed in an eight-fold figure
    for (n = 1; n < nodes; n += 2) {
      ny = nodeY(n);
      var th = -Math.PI / 16,
        r0 = ringR * 1.24;
      draws.push(
        kaleido({
          cx: cx,
          cy: ny,
          n: 2,
          axisPad: 12,
          rIn: ringR * 1.2,
          rx: reach * 0.97,
          ry: nodeGap * 0.5 - 8,
          starts: [
            { x: ringR * 1.26, y: -30, ang: -0.9, s: reach * 0.62, sg: 1, w: 8, depth: 3 },
            { x: ringR * 1.1, y: -ringR * 0.75, ang: -0.5, s: reach * 0.45, sg: 1, w: 6, depth: 3, col: RUG.gold },
            { x: reach * 0.62, y: -30, ang: -1.2, s: nodeGap * 0.35, sg: 1, w: 6, depth: 2 },
          ],
        })
      );
    }
    // 4a. the top of the rug gets a central figure of its own
    var tcy = fy + topH * 0.52,
      tRy = topH * 0.5 - 10;
    draws.push(
      kaleido({
        cx: cx,
        cy: tcy,
        n: 2,
        rIn: 0,
        rx: reach * 0.97,
        ry: tRy,
        starts: [
          { x: 32, y: -26, ang: -0.9, s: reach * 0.92, sg: 1, w: 9, depth: 3 },
          { x: 60, y: -tRy * 0.5, ang: -0.6, s: reach * 0.5, sg: 1, w: 7, depth: 3, col: RUG.gold },
          { x: reach * 0.45, y: -28, ang: -1.2, s: tRy * 0.8, sg: 1, w: 6, depth: 2 },
          { x: reach * 0.7, y: -28, ang: -1.0, s: tRy * 0.55, sg: 1, w: 5, depth: 2, col: RUG.gold },
        ],
      })
    );
    // 4. the bands between the rings: mirrored through the spine and through their own centre line
    for (n = 0; n < nodes; n += 2) {
      ny = nodeY(n);
      var bry = nodeGap * 0.5 - 8;
      draws.push(
        kaleido({
          cx: cx,
          cy: ny,
          n: 2,
          rIn: 0,
          rx: reach * 0.97,
          ry: bry,
          starts: [
            { x: 32, y: -26, ang: -0.9, s: reach * 0.92, sg: 1, w: 9, depth: 3 },
            { x: 60, y: -bry * 0.5, ang: -0.6, s: reach * 0.5, sg: 1, w: 7, depth: 3, col: RUG.gold },
            { x: reach * 0.45, y: -28, ang: -1.2, s: bry * 0.8, sg: 1, w: 6, depth: 2 },
          ],
        })
      );
    }
    // 2. edges: two-axis figures growing inwards from both sides (they fill whatever room is left)
    for (var e = 0; e <= nodes; e++) {
      var ey = edgeY(e);
      edgeDraws.push(
        kaleido({
          cx: fx + fw,
          cy: ey,
          n: 2,
          rIn: 0,
          rx: reach * 0.34,
          ry: nodeGap * 0.32,
          starts: [
            { x: 32, y: -26, ang: -0.8, s: reach * 0.38, sg: 1, w: 7, depth: 2, col: e % 2 ? RUG.gold : RUG.ivory },
            { x: 32, y: -nodeGap * 0.2, ang: -0.4, s: reach * 0.26, sg: 1, w: 5, depth: 2 },
          ],
        })
      );
    }
    // 5. crown and dagger guard
    var crown = [];
    growC(crown, cx, fy + fh * 0.05, -Math.PI / 2 + 0.35, Math.min(reach * 0.55, 260), 1, 7, 2, RUG.ivory, "fixed");
    growC(crown, cx, fy + fh * 0.05, -Math.PI / 2 + 1.25, Math.min(reach * 0.45, 220), 1, 6, 2, RUG.ivory, "fixed");
    growC(crown, cx, fy + fh * 0.9, -0.15, Math.min(reach * 0.45, 220), 1, 6, 2, RUG.ivory, "fixed");
    lists.push(crown);

    // draw: spine, then all branches and their mirror images
    var sp = [];
    for (var i = 0; i <= 40; i++) sp.push([cx, fy + fh * 0.04 + fh * 0.88 * (i / 40), Math.PI / 2, i / 40]);
    taper(ctx, sp, 9, 4, RUG.ivory);
    for (var yb = fy + fh * 0.06; yb < fy + fh * 0.9; yb += 52) bead(ctx, cx, yb, 5.5, RUG.gold);
    spike(ctx, cx, fy + fh * 0.05, -Math.PI / 2, Math.min(fh * 0.04, 90), 6, RUG.ivory);
    spike(ctx, cx, fy + fh * 0.92, Math.PI / 2, Math.min(fh * 0.06, 160), 8, RUG.ivory);
    draws.forEach(function (d) {
      d(ctx, false);
    });
    edgeDraws.forEach(function (d) {
      d(ctx, false);
      d(ctx, true);
    });
    lists.forEach(function (l) {
      drawMirrored(ctx, l, cx);
    });
  }

  function rugLineFree(st, cx, x, y, r) {
    var CS = 6;
    var mx = x < cx ? 2 * cx - x : x;
    var r2 = Math.ceil(r / CS);
    var bx = Math.floor(mx / CS),
      by = Math.floor(y / CS);
    for (var dy = -r2; dy <= r2; dy++) for (var dx = -r2; dx <= r2; dx++) if (st.cells[bx + dx + "," + (by + dy)]) return false;
    return !st.reserved.some(function (c) {
      return Math.hypot(x - c.x, y - c.y) < c.r + r + 6;
    });
  }

  // is a small motif's spot empty: not on a block, not on filigree (either half)
  function rugSpotFree(st, cx, x, y, r) {
    var CS = 6;
    var mx = x < cx ? 2 * cx - x : x;
    var r2 = Math.ceil(r / CS);
    var bx = Math.floor(mx / CS),
      by = Math.floor(y / CS);
    for (var dy = -r2; dy <= r2; dy++) for (var dx = -r2; dx <= r2; dx++) if (st.cells[bx + dx + "," + (by + dy)]) return false;
    return !st.blocks.some(function (b) {
      var ex = (x - b.x) / (b.rx + r + 6),
        ey = (y - b.y) / (b.ry + r + 6);
      return ex * ex + ey * ey < 1;
    });
  }

  function drawOneRug(ctx, W, H, rects, boxes) {
    boxes = boxes || [];
    function free(x, y, r) {
      for (var i = 0; i < boxes.length; i++) {
        var b = boxes[i];
        if (x + r > b[0] && x - r < b[2] && y + r > b[1] && y - r < b[3]) return false;
      }
      return true;
    }
    function hitsText(inside, bx0, by0, bx1, by1) {
      for (var i = 0; i < boxes.length; i++) {
        var b = boxes[i];
        if (b[2] < bx0 || b[0] > bx1 || b[3] < by0 || b[1] > by1) continue;
        for (var yy = b[1]; yy <= b[3] + 0.1; yy += Math.max(4, (b[3] - b[1]) / 2)) {
          for (var xx = b[0]; xx <= b[2] + 0.1; xx += 8) if (inside(xx, yy)) return true;
        }
      }
      return false;
    }
    var B = clamp(W * 0.075, 46, 116);
    ctx.fillStyle = RUG.red;
    ctx.fillRect(0, 0, W, H);
    var fx = B,
      fy = B,
      fw = W - 2 * B,
      fh = H - 2 * B;
    for (var y = 0; y < H; y += rnd(10, 40)) {
      ctx.fillStyle = R() < 0.5 ? "rgba(20,0,0," + rnd(0, 0.12) + ")" : "rgba(160,50,40," + rnd(0, 0.08) + ")";
      ctx.fillRect(B, y, fw, rnd(10, 40));
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(fx, fy, fw, fh);
    ctx.clip();
    var cx = W / 2;

    // lace medallions where they clear the text, as central as possible
    function medShape(mx, my, rx, ry, pad) {
      return function (x, y) {
        var dx = (x - mx) / (rx * 1.08 + pad),
          dy = (y - my) / (ry * 1.06 + pad);
        return dx * dx + dy * dy < 1 || (Math.abs(x - mx) < rx * 0.2 + pad && Math.abs(y - my) < ry * 1.5 + pad);
      };
    }
    var meds = [];
    [].forEach(function (Rt) {
      var rx = Math.min(Rt, fw * 0.3),
        ry = rx * 1.35;
      if (rx < 130) return;
      for (var my = fy + ry * 1.55; my < fy + fh - ry * 1.55; my += 40) {
        if (
          meds.some(function (m) {
            return Math.abs(m.y - my) < (m.ry + ry) * 1.6 + 140;
          })
        )
          continue;
        var xs = [];
        for (var mx = fx + rx * 1.15; mx <= fx + fw - rx * 1.15; mx += 20) xs.push(mx);
        xs.sort(function (a, b) {
          return Math.abs(a - cx) - Math.abs(b - cx);
        });
        for (var xi = 0; xi < xs.length; xi++) {
          if (!hitsText(medShape(xs[xi], my, rx, ry, 14), xs[xi] - rx * 1.2, my - ry * 1.6, xs[xi] + rx * 1.2, my + ry * 1.6)) {
            meds.push({ x: xs[xi], y: my, rx: rx, ry: ry });
            my += ry * 2;
            break;
          }
        }
      }
    });
    // lace corners, shrunk until they clear the text
    var corners = [
      [fx, fy, 1, 1],
      [fx + fw, fy, -1, 1],
      [fx, fy + fh, 1, -1],
      [fx + fw, fy + fh, -1, -1],
    ]
      .map(function (k) {
        for (var r = Math.min(fw * 0.17, 200); r > 70; r -= 20) {
          var hit = hitsText(
            function (x, y) {
              return Math.hypot(x - k[0], y - k[1]) < r * 1.1 + 12;
            },
            k[0] - r * 1.2,
            k[1] - r * 1.2,
            k[0] + r * 1.2,
            k[1] + r * 1.2
          );
          if (!hit) return [k[0], k[1], k[2], k[3], r];
        }
        return null;
      })
      .filter(Boolean);
    function inAnyShape(x, y) {
      for (var i = 0; i < meds.length; i++) if (medShape(meds[i].x, meds[i].y, meds[i].rx, meds[i].ry, 8)(x, y)) return true;
      for (var c = 0; c < corners.length; c++) if (Math.hypot(x - corners[c][0], y - corners[c][1]) < corners[c][4] * 1.12) return true;
      return false;
    }
    // the overarching filigree, on its own layer so the text lines can be erased from it
    var layer = makeCanvas(ctx.canvas.width, ctx.canvas.height);
    var lg = layer.getContext("2d");
    var st = {
      blocks: [],
      cells: {},
      reserved: corners.map(function (c) {
        return { x: c[0], y: c[1], r: c[4] * 1.15 };
      }),
      textHit: function (x, y, rx, ry) {
        return boxes.some(function (b) {
          return b[2] > x - rx && b[0] < x + rx && b[3] > y - ry && b[1] < y + ry;
        });
      },
    };
    overarching(ctx, fx, fy, fw, fh, cx, "blocks", st);
    lg.setTransform(ctx.getTransform());
    overarching(lg, fx, fy, fw, fh, cx, "lines", st);
    lg.globalCompositeOperation = "destination-out";
    lg.fillStyle = "#000";
    boxes.forEach(function (b) {
      roundRect(lg, b[0] - 6, b[1] - 4, b[2] - b[0] + 12, b[3] - b[1] + 8, 8);
      lg.fill();
    });
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
    // small individual motifs scattered through the gaps
    corners.forEach(function (k) {
      laceCorner(ctx, k[0], k[1], k[2], k[3], k[4], free);
    });

    ctx.restore();

    // borders: ivory bead line, dark main border with an ivory filigree meander, ivory guard
    var sides = [
      { tx: 0, ty: 0, rot: 0, L: W },
      { tx: W, ty: 0, rot: Math.PI / 2, L: H },
      { tx: W, ty: H, rot: Math.PI, L: W },
      { tx: 0, ty: H, rot: -Math.PI / 2, L: H },
    ];
    var g1 = B * 0.12,
      main = B * 0.62,
      g3 = B * 0.12;
    sides.forEach(function (sd) {
      ctx.save();
      ctx.translate(sd.tx, sd.ty);
      ctx.rotate(sd.rot);
      var L = sd.L;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(L, 0);
      ctx.lineTo(L - B, B);
      ctx.lineTo(B, B);
      ctx.closePath();
      ctx.clip();
      var d = 0,
        n,
        i;
      ctx.fillStyle = RUG.burgundy;
      ctx.fillRect(0, 0, L, B);
      n = Math.round(L / (g1 * 1.1));
      for (i = 0; i <= n; i++) bead(ctx, (i * L) / n, d + g1 / 2, g1 * 0.2, i % 2 ? RUG.ivory : RUG.gold);
      d += g1;
      ctx.fillStyle = RUG.ivory;
      ctx.fillRect(0, d, L, 2);
      d += 2;
      ctx.fillStyle = RUG.navy;
      ctx.fillRect(0, d, L, main);
      var mid = d + main / 2;
      var per = main * 1.6;
      n = Math.max(2, Math.round(L / per));
      per = L / n;
      for (i = 0; i < n; i++) {
        var bx = (i + 0.5) * per;
        curl(ctx, bx, mid, -0.2, main * 0.62, -1, Math.max(1.8, main * 0.06), RUG.ivory, 1);
        curl(ctx, bx, mid, Math.PI + 0.2, main * 0.62, -1, Math.max(1.8, main * 0.06), RUG.ivory, 1);
        sigil(ctx, bx + per / 2, mid, main * 0.2, RUG.gold, RUG.ivory);
      }
      d += main;
      ctx.fillStyle = RUG.ivory;
      ctx.fillRect(0, d, L, 2);
      d += 2;
      n = Math.round(L / (g3 * 1.1));
      for (i = 0; i <= n; i++) bead(ctx, (i * L) / n, d + g3 / 2, g3 * 0.18, RUG.ivory);
      ctx.restore();
    });
  }

  // central medallion: lobed outline, pendants, a ring of palmettes and rosettes,
  // a red inner field with its own small herati, and a star at the heart
  function bigMedallion(ctx, cx, cy, rx, ry) {
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = RUG.ink;
    [-1, 1].forEach(function (sg) {
      var py = cy + sg * ry * 1.14;
      ctx.fillStyle = RUG.ivory;
      lobed(ctx, cx, py, rx * 0.26, ry * 0.13, 10, 0.12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = RUG.navy;
      lobed(ctx, cx, py, rx * 0.22, ry * 0.1, 10, 0.12);
      ctx.fill();
      ctx.stroke();
      rosette(ctx, cx, py, ry * 0.07, 8, RUG.gold, RUG.ivory, RUG.red2);
      palmette(ctx, cx, py + sg * ry * 0.2, ry * 0.08, sg > 0 ? 0 : Math.PI, RUG.gold, RUG.ivory);
    });
    ctx.fillStyle = RUG.ivory;
    lobed(ctx, cx, cy, rx * 1.05, ry * 1.04, 20, 0.09);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = RUG.navy;
    lobed(ctx, cx, cy, rx, ry, 20, 0.09);
    ctx.fill();
    ctx.stroke();
    // ring of motifs
    for (var a = 0; a < 20; a++) {
      var ang = (a / 20) * TAU;
      var mx = cx + Math.cos(ang) * rx * 0.8,
        my = cy + Math.sin(ang) * ry * 0.8;
      if (a % 2) palmette(ctx, mx, my, Math.min(rx, ry) * 0.075, ang + Math.PI / 2, RUG.pink, RUG.ivory);
      else rosette(ctx, mx, my, Math.min(rx, ry) * 0.065, 8, RUG.gold, RUG.ivory, RUG.red2);
    }
    // inner red field with a small herati of its own
    ctx.save();
    ctx.fillStyle = RUG.red2;
    lobed(ctx, cx, cy, rx * 0.64, ry * 0.64, 12, 0.12);
    ctx.fill();
    ctx.stroke();
    ctx.clip();
    var s2 = Math.min(rx, ry) * 0.14;
    for (var j = -6; j <= 6; j++) {
      for (var i = -6; i <= 6; i++) {
        var px = cx + i * s2,
          py = cy + j * s2;
        if ((i + j) % 2) rosette(ctx, px, py, s2 * 0.22, 6, RUG.ivory, RUG.navy, RUG.gold);
        else {
          for (var q = 0; q < 4; q++) {
            var aq = (q * Math.PI) / 2 + Math.PI / 4;
            leaf(ctx, px + Math.cos(aq) * s2 * 0.15, py + Math.sin(aq) * s2 * 0.15, s2 * 0.5, aq - Math.PI / 2, q % 2 ? RUG.green : RUG.blue);
          }
        }
      }
    }
    ctx.restore();
    ctx.lineWidth = 2;
    ctx.strokeStyle = RUG.ink;
    ctx.fillStyle = RUG.gold;
    star(ctx, cx, cy, Math.min(rx, ry) * 0.36, Math.min(rx, ry) * 0.24, 8, Math.PI / 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = RUG.navy;
    star(ctx, cx, cy, Math.min(rx, ry) * 0.24, Math.min(rx, ry) * 0.16, 8, 0);
    ctx.fill();
    ctx.stroke();
    rosette(ctx, cx, cy, Math.min(rx, ry) * 0.15, 12, RUG.ivory, RUG.pink, RUG.gold);
    ctx.restore();
  }

  // up to RUG_SPLIT wide the page is one rug; wider, two columns of rugs on a wooden floor,
  // the right column shifted by half a rug so the rugs zigzag
  var RUG_SPLIT = 1100;
  function rugColumns(W) {
    var split = Math.round(W / 2);
    return [
      { x: 0, w: split, off: 0 },
      { x: split, w: W - split, off: 0.5 },
    ];
  }
  function drawRugWorld(ctx, W, H, rects, boxes) {
    if (W < RUG_SPLIT) return drawOneRug(ctx, W, H, rects, boxes);
    // floorboards
    ctx.fillStyle = "#1e130d";
    ctx.fillRect(0, 0, W, H);
    for (var py = 0; py < H; py += 46) {
      ctx.fillStyle = R() < 0.5 ? "#24170f" : "#1a100a";
      ctx.fillRect(0, py, W, 44);
      ctx.fillStyle = "#0e0806";
      ctx.fillRect(0, py + 44, W, 2);
      for (var px = rnd(0, 300); px < W; px += rnd(220, 420)) ctx.fillRect(px, py, 2, 44);
    }
    var gap = 0;
    rugColumns(W).forEach(function (c, ci) {
      var target = Math.round(clamp(c.w * 1.6, 820, 1500));
      // rugs touch edge to edge; the right column is shifted by half a rug so they zigzag
      var k = 0;
      for (var y = -c.off * target; y < H; k++) {
        var rh = target;
        var yy = Math.round(y);
        y += rh + gap;
        ctx.save();
        ctx.beginPath();
        ctx.rect(c.x, yy, c.w, rh);
        ctx.clip();
        ctx.translate(c.x, yy);
        var local = (boxes || []).map(function (b) {
          return [b[0] - c.x, b[1] - yy, b[2] - c.x, b[3] - yy];
        });
        withPalette(ci + k * 2, function () {
          drawOneRug(ctx, c.w, rh, [], local);
        });
        ctx.restore();
      }
    });
  }

  // paisley / boteh: teardrop with a curled tip and nested fills
  function boteh(ctx, x, y, s, dir, ci) {
    var cols = [
      [RUG.ivory, RUG.navy, RUG.gold],
      [RUG.navy, RUG.ivory, RUG.pink],
      [RUG.gold, RUG.navy, RUG.ivory],
    ][ci];
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir, 1);
    ctx.strokeStyle = RUG.ink;
    ctx.lineWidth = 2;
    [1, 0.68, 0.38].forEach(function (k, i) {
      var r = s * 0.5 * k;
      ctx.fillStyle = cols[i];
      ctx.beginPath();
      ctx.arc(0, r * 0.4, r, Math.PI * 0.05, Math.PI * 1.15, false);
      ctx.bezierCurveTo(-r * 1.1, -r * 0.9, r * 0.1, -r * 1.9, r * 0.6, -r * 2.1);
      ctx.bezierCurveTo(r * 0.3, -r * 1.4, r * 1.3, -r * 0.6, r * 0.99, r * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  }

  function cypress(ctx, x, baseY, h) {
    ctx.save();
    ctx.strokeStyle = RUG.ink;
    ctx.lineWidth = 2;
    ctx.fillStyle = RUG.green;
    ctx.beginPath();
    ctx.moveTo(x, baseY - h);
    ctx.bezierCurveTo(x + h * 0.22, baseY - h * 0.6, x + h * 0.2, baseY - h * 0.2, x + h * 0.04, baseY - h * 0.08);
    ctx.lineTo(x - h * 0.04, baseY - h * 0.08);
    ctx.bezierCurveTo(x - h * 0.2, baseY - h * 0.2, x - h * 0.22, baseY - h * 0.6, x, baseY - h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = RUG.gold;
    ctx.lineWidth = 1.5;
    for (var t = 0.2; t < 0.9; t += 0.14) {
      ctx.beginPath();
      ctx.moveTo(x, baseY - h * t);
      ctx.lineTo(x + h * 0.09 * (1 - Math.abs(t - 0.5)), baseY - h * (t + 0.06));
      ctx.moveTo(x, baseY - h * t);
      ctx.lineTo(x - h * 0.09 * (1 - Math.abs(t - 0.5)), baseY - h * (t + 0.06));
      ctx.stroke();
    }
    ctx.fillStyle = RUG.navy;
    ctx.fillRect(x - h * 0.03, baseY - h * 0.1, h * 0.06, h * 0.1);
    ctx.restore();
  }

  // a woven inscription panel: ivory guard, rosette band, gold line, deep field, corner pieces
  function drawCartouche(ctx, x, y, w, h) {
    ctx.save();
    ctx.fillStyle = RUG.ink;
    ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
    ctx.fillStyle = RUG.ivory;
    ctx.fillRect(x, y, w, h);
    var b1 = 4,
      band = 16;
    ctx.fillStyle = RUG.navy;
    ctx.fillRect(x + b1, y + b1, w - 2 * b1, h - 2 * b1);
    // rosettes running round the band
    var step = 22;
    var inner = b1 + band / 2;
    for (var t = inner; t <= w - inner; t += step) {
      rosette(ctx, x + t, y + inner, 6, 6, RUG.red2, RUG.ivory, RUG.gold);
      rosette(ctx, x + t, y + h - inner, 6, 6, RUG.red2, RUG.ivory, RUG.gold);
    }
    for (t = inner + step; t <= h - inner - step / 2; t += step) {
      rosette(ctx, x + inner, y + t, 6, 6, RUG.red2, RUG.ivory, RUG.gold);
      rosette(ctx, x + w - inner, y + t, 6, 6, RUG.red2, RUG.ivory, RUG.gold);
    }
    var d = b1 + band;
    ctx.fillStyle = RUG.gold;
    ctx.fillRect(x + d, y + d, w - 2 * d, h - 2 * d);
    d += 3;
    ctx.fillStyle = "#111a31";
    ctx.fillRect(x + d, y + d, w - 2 * d, h - 2 * d);
    // faint field lattice, kept low-contrast so text stays readable
    ctx.fillStyle = "rgba(60,80,130,0.35)";
    for (var yy = y + d + 12; yy < y + h - d; yy += 24) {
      for (var xx = x + d + 12 + ((yy - y) % 48 ? 12 : 0); xx < x + w - d; xx += 24) {
        ctx.fillRect(xx - 1.5, yy - 1.5, 3, 3);
      }
    }
    // corner pieces
    var cr = Math.min(46, w * 0.12, h * 0.25);
    [
      [x + d, y + d, 0],
      [x + w - d, y + d, Math.PI / 2],
      [x + w - d, y + h - d, Math.PI],
      [x + d, y + h - d, -Math.PI / 2],
    ].forEach(function (c) {
      ctx.save();
      ctx.translate(c[0], c[1]);
      ctx.rotate(c[2]);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, cr, 0, Math.PI / 2);
      ctx.closePath();
      ctx.fillStyle = RUG.red2;
      ctx.fill();
      ctx.strokeStyle = RUG.gold;
      ctx.lineWidth = 2;
      ctx.stroke();
      rosette(ctx, cr * 0.38, cr * 0.38, cr * 0.26, 8, RUG.gold, RUG.ivory, RUG.navy);
      ctx.restore();
    });
    ctx.restore();
  }

  // ============================================================ PAINTED TILES
  // Each tile is painted (mostly) in one colour family; neighbours differ.
  var TILE_HUES = {
    forest: [140, 48, 22],
    moss: [95, 40, 30],
    olive: [70, 45, 30],
    sage: [120, 18, 44],
    jade: [160, 32, 30],
    oxblood: [355, 58, 26],
    wine: [340, 45, 24],
    rose: [350, 35, 52],
    umber: [22, 50, 24],
    amber: [38, 68, 40],
  };
  var TILE_NAMES = Object.keys(TILE_HUES);
  var CREAM = "#e9dbbc",
    INK = "#1d1a1a";
  var MOTIFS = ["rosette", "mandala", "pinwheel", "moorish", "lattice", "vine", "quatrefoil"];
  function hsl(b, dl, ds) {
    return "hsl(" + b[0] + "," + clamp(b[1] + (ds || 0), 0, 100) + "%," + clamp(b[2] + dl, 4, 94) + "%)";
  }

  function tileDesign(T, name, motif) {
    var c = makeCanvas(T, T);
    var g = c.getContext("2d");
    var b = TILE_HUES[name];
    var mono = R() < 0.97;
    var base = hsl(b, 0),
      dark = hsl(b, -17, 5),
      deep = hsl(b, -27, 5),
      light = hsl(b, 20, -10),
      pale = hsl(b, 34, -20);
    var bgc = mono ? base : CREAM;
    var roles = mono ? [dark, light, pale, deep, dark, light] : [base, dark, light, base];
    var C = function () {
      return pick(roles);
    };
    var accent = hsl(TILE_HUES[pick(TILE_NAMES)], 0);
    var line = mono ? hsl(b, -30, 0) : INK;
    var h = T / 2;
    g.fillStyle = bgc;
    g.fillRect(0, 0, T, T);
    g.lineJoin = "round";
    g.lineCap = "round";
    g.strokeStyle = line;
    g.lineWidth = Math.max(1, T * 0.011);

    function sym(fn) {
      for (var k = 0; k < 4; k++) {
        g.save();
        g.translate(h, h);
        g.rotate((k * Math.PI) / 2);
        fn(k);
        g.restore();
      }
    }
    function fillStroke(col) {
      g.fillStyle = col;
      g.fill();
      g.stroke();
    }
    function petals(n, r, wRatio, cols, rot) {
      for (var i = 0; i < n; i++) {
        g.save();
        g.rotate((i / n) * TAU + (rot || 0));
        g.beginPath();
        g.moveTo(0, 0);
        g.quadraticCurveTo(r * wRatio, r * 0.55, 0, r);
        g.quadraticCurveTo(-r * wRatio, r * 0.55, 0, 0);
        fillStroke(cols[i % cols.length]);
        g.restore();
      }
    }
    function disc(r, col) {
      g.beginPath();
      g.arc(0, 0, r, 0, TAU);
      fillStroke(col);
    }
    function dotRing(r, n, size, col) {
      g.fillStyle = col;
      for (var i = 0; i < n; i++) {
        var a = (i / n) * TAU;
        g.beginPath();
        g.arc(Math.cos(a) * r, Math.sin(a) * r, size, 0, TAU);
        g.fill();
      }
    }
    // corner fans (meet neighbours to form circles)
    function cornerFans(scallop) {
      var cr = T * rnd(0.24, 0.38),
        c1 = C(),
        c2 = C();
      sym(function () {
        g.save();
        g.translate(-h, -h);
        g.beginPath();
        g.moveTo(0, 0);
        if (scallop) {
          var n = 5;
          for (var i = 0; i <= n; i++) {
            var a = (i / n) * (Math.PI / 2);
            g.lineTo(Math.cos(a) * cr, Math.sin(a) * cr);
          }
          g.closePath();
          fillStroke(c1);
          for (i = 0; i < n; i++) {
            var am = ((i + 0.5) / n) * (Math.PI / 2);
            g.beginPath();
            g.arc(Math.cos(am) * cr * 0.93, Math.sin(am) * cr * 0.93, cr * 0.17, 0, TAU);
            fillStroke(c2);
          }
        } else {
          g.arc(0, 0, cr, 0, Math.PI / 2);
          g.closePath();
          fillStroke(c1);
          g.beginPath();
          g.moveTo(0, 0);
          g.arc(0, 0, cr * 0.55, 0, Math.PI / 2);
          g.closePath();
          fillStroke(c2);
        }
        g.restore();
      });
    }
    function edgeBumps() {
      var er = T * rnd(0.08, 0.15),
        ec = C();
      sym(function () {
        g.beginPath();
        g.arc(0, -h, er, 0, Math.PI);
        g.closePath();
        fillStroke(ec);
      });
    }

    var c1 = C(),
      c2 = C(),
      c3 = C();
    if (motif === "rosette") {
      if (R() < 0.7) cornerFans(R() < 0.5);
      if (R() < 0.5) edgeBumps();
      g.save();
      g.translate(h, h);
      petals(pick([8, 12]), T * rnd(0.28, 0.36), rnd(0.3, 0.45), [c1, c2]);
      petals(8, T * 0.18, 0.4, [c3], Math.PI / 8);
      disc(T * 0.06, accent);
      dotRing(T * 0.4, 16, T * 0.01, mono ? CREAM : INK);
      g.restore();
    } else if (motif === "mandala") {
      cornerFans(true);
      g.save();
      g.translate(h, h);
      disc(T * 0.34, c1);
      for (var i = 0; i < 16; i++) {
        g.save();
        g.rotate((i / 16) * TAU);
        g.beginPath();
        g.arc(0, -T * 0.34, T * 0.035, 0, TAU);
        fillStroke(c2);
        g.restore();
      }
      petals(16, T * 0.3, 0.18, [c3, c2]);
      disc(T * 0.15, c2);
      star(g, 0, 0, T * 0.13, T * 0.07, 8, 0);
      fillStroke(accent);
      disc(T * 0.03, CREAM);
      g.restore();
    } else if (motif === "pinwheel") {
      if (R() < 0.6) cornerFans(false);
      g.save();
      g.translate(h, h);
      var blades = pick([4, 6, 8]);
      for (i = 0; i < blades; i++) {
        g.save();
        g.rotate((i / blades) * TAU);
        g.beginPath();
        g.moveTo(0, 0);
        g.bezierCurveTo(T * 0.18, -T * 0.05, T * 0.3, T * 0.1, T * 0.22, T * 0.3);
        g.bezierCurveTo(T * 0.12, T * 0.18, T * 0.05, T * 0.08, 0, 0);
        fillStroke(i % 2 ? c1 : c2);
        g.restore();
      }
      disc(T * 0.08, accent);
      dotRing(T * 0.12, 8, T * 0.012, CREAM);
      g.restore();
    } else if (motif === "moorish") {
      g.save();
      g.translate(h, h);
      // cut corners: quarter octagons
      sym(function () {
        g.beginPath();
        g.moveTo(-h, -h);
        g.lineTo(-h + T * 0.22, -h);
        g.lineTo(-h, -h + T * 0.22);
        g.closePath();
        fillStroke(c3);
      });
      // interlaced 8-point star band
      var R1 = T * 0.4;
      g.lineWidth = T * 0.05;
      g.strokeStyle = line;
      star(g, 0, 0, R1, R1 * 0.72, 8, Math.PI / 8);
      g.fillStyle = c1;
      g.fill();
      g.stroke();
      g.lineWidth = T * 0.03;
      g.strokeStyle = CREAM;
      g.stroke();
      g.lineWidth = Math.max(1, T * 0.011);
      g.strokeStyle = line;
      star(g, 0, 0, R1 * 0.62, R1 * 0.46, 8, 0);
      fillStroke(c2);
      petals(8, T * 0.2, 0.35, [c3, CREAM]);
      disc(T * 0.05, accent);
      g.restore();
    } else if (motif === "lattice") {
      g.save();
      g.beginPath();
      g.rect(0, 0, T, T);
      g.clip();
      var cell = T / 4;
      g.translate(h, h);
      g.rotate(Math.PI / 4);
      for (var gy = -4; gy < 4; gy++) {
        for (var gx = -4; gx < 4; gx++) {
          g.beginPath();
          g.rect(gx * cell * 0.7071, gy * cell * 0.7071, cell * 0.7071, cell * 0.7071);
          fillStroke((gx + gy) % 2 ? c1 : c2);
        }
      }
      g.restore();
      g.save();
      g.translate(h, h);
      g.beginPath();
      g.arc(0, 0, T * 0.2, 0, TAU);
      fillStroke(bgc);
      petals(4, T * 0.18, 0.45, [c3], Math.PI / 4);
      disc(T * 0.05, accent);
      g.restore();
    } else if (motif === "vine") {
      if (R() < 0.6) edgeBumps();
      g.save();
      g.translate(h, h);
      var leafC = c2;
      for (i = 0; i < 4; i++) {
        g.save();
        g.rotate((i / 4) * TAU + Math.PI / 4);
        g.lineWidth = T * 0.02;
        g.beginPath();
        g.moveTo(0, 0);
        g.bezierCurveTo(T * 0.12, -T * 0.12, T * 0.28, T * 0.1, T * 0.42, 0);
        g.stroke();
        g.lineWidth = Math.max(1, T * 0.011);
        for (var lf = 0; lf < 3; lf++) {
          var lx = T * (0.12 + lf * 0.11),
            ly = (lf % 2 ? 1 : -1) * T * 0.02;
          g.save();
          g.translate(lx, ly);
          g.rotate((lf % 2 ? 1 : -1) * 0.9);
          g.beginPath();
          g.moveTo(0, 0);
          g.quadraticCurveTo(T * 0.04, T * 0.05, 0, T * 0.11);
          g.quadraticCurveTo(-T * 0.04, T * 0.05, 0, 0);
          fillStroke(leafC);
          g.restore();
        }
        g.beginPath();
        g.arc(T * 0.42, 0, T * 0.035, 0, TAU);
        fillStroke(accent);
        g.restore();
      }
      petals(6, T * 0.12, 0.45, [c1]);
      disc(T * 0.04, CREAM);
      g.restore();
    } else {
      // quatrefoil
      cornerFans(false);
      g.save();
      g.translate(h, h);
      var qr = T * 0.15;
      for (i = 0; i < 4; i++) {
        var a = (i / 4) * TAU;
        g.beginPath();
        g.arc(Math.cos(a) * qr, Math.sin(a) * qr, qr * 1.15, 0, TAU);
        fillStroke(c1);
      }
      g.beginPath();
      g.rect(-qr, -qr, qr * 2, qr * 2);
      g.fillStyle = c1;
      g.fill();
      g.rotate(Math.PI / 4);
      g.beginPath();
      g.rect(-qr * 0.8, -qr * 0.8, qr * 1.6, qr * 1.6);
      fillStroke(c2);
      g.rotate(-Math.PI / 4);
      petals(4, qr * 1.5, 0.4, [c3]);
      disc(T * 0.045, accent);
      g.restore();
    }
    if (R() < 0.35) {
      g.strokeStyle = mono ? CREAM : dark;
      g.lineWidth = T * 0.022;
      g.strokeRect(T * 0.045, T * 0.045, T * 0.91, T * 0.91);
    }
    return c;
  }

  // ============================================================ PATCHWORK (blog)
  // Square patches of woven fabric (plaid, gingham, tweed, corduroy, herringbone,
  // star appliqué) joined with cream blanket stitches. Rendered through the knot
  // shader, so it shares the rug's pixelated weave.
  var FAB = {
    rust: "#9a4a2a",
    mustard: "#b8892e",
    navy: "#1f2b45",
    forest: "#2f4a35",
    wine: "#6e2026",
    oat: "#b9a98a",
    brown: "#5a3a26",
    olive: "#6b6a3a",
    slate: "#3e4650",
    teal: "#2e5552",
  };
  var FAB_KEYS = Object.keys(FAB);
  var FAB_CHAR = "#26211d",
    FAB_CREAM = "#dccca4";
  function fshade(hex, f, a) {
    var n = parseInt(hex.slice(1), 16);
    var r = clamp(Math.round(((n >> 16) & 255) * f), 0, 255),
      g = clamp(Math.round(((n >> 8) & 255) * f), 0, 255),
      b = clamp(Math.round((n & 255) * f), 0, 255);
    return "rgba(" + r + "," + g + "," + b + "," + (a === undefined ? 1 : a) + ")";
  }
  function blanketStitch(g, x, y, s) {
    g.strokeStyle = FAB_CREAM;
    g.lineWidth = 2;
    g.beginPath();
    for (var t = 6; t < s - 3; t += 9) {
      g.moveTo(x + t, y + 1);
      g.lineTo(x + t, y + 6);
      g.moveTo(x + t, y + s - 1);
      g.lineTo(x + t, y + s - 6);
      g.moveTo(x + 1, y + t);
      g.lineTo(x + 6, y + t);
      g.moveTo(x + s - 1, y + t);
      g.lineTo(x + s - 6, y + t);
    }
    g.stroke();
  }
  function drawPatch(g, x, y, w, h, col, type) {
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
    var i;
    if (type === "plaid") {
      var c2 = fshade(col, 1.45, 0.5),
        c3 = fshade(col, 0.55, 0.7);
      for (i = 0; i < Math.max(w, h); i += 24) {
        g.fillStyle = c2;
        g.fillRect(x + i, y, 7, h);
        g.fillRect(x, y + i, w, 7);
        g.fillStyle = c3;
        g.fillRect(x + i + 14, y, 2, h);
        g.fillRect(x, y + i + 14, w, 2);
      }
    } else if (type === "gingham") {
      g.fillStyle = fshade(col, 1.5, 0.45);
      for (i = 0; i < w; i += 20) g.fillRect(x + i, y, 10, h);
      for (i = 0; i < h; i += 20) g.fillRect(x, y + i, w, 10);
    } else if (type === "tweed") {
      for (i = 0; i < (w * h) / 18; i++) {
        g.fillStyle = R() < 0.85 ? fshade(col, rnd(0.6, 1.5)) : pick([FAB_CREAM, FAB.mustard, FAB.rust]);
        g.fillRect(x + rnd(0, w), y + rnd(0, h), rnd(1, 3), rnd(1, 2));
      }
    } else if (type === "cord") {
      for (i = 0; i < w; i += 6) {
        g.fillStyle = fshade(col, i % 12 ? 1.18 : 0.82);
        g.fillRect(x + i, y, 3, h);
      }
    } else if (type === "herring") {
      g.strokeStyle = fshade(col, 1.35);
      g.lineWidth = 2;
      g.beginPath();
      for (var yy = 0; yy < h; yy += 9) {
        for (var xx = 0; xx < w; xx += 9) {
          var dir = (Math.floor(xx / 9) % 2) * 2 - 1;
          g.moveTo(x + xx, y + yy + (dir > 0 ? 0 : 8));
          g.lineTo(x + xx + 7, y + yy + (dir > 0 ? 8 : 0));
        }
      }
      g.stroke();
    } else if (type === "star") {
      var sc = pick([FAB.navy, FAB.wine, FAB.forest, FAB.brown]);
      var cx = x + w / 2,
        cy = y + h / 2,
        r = Math.min(w, h) * 0.36;
      g.fillStyle = sc;
      star(g, cx, cy, r, r * 0.45, 5, -Math.PI / 2);
      g.fill();
      g.setLineDash([3, 3]);
      g.strokeStyle = FAB_CREAM;
      g.lineWidth = 1.6;
      g.stroke();
      g.setLineDash([]);
    }
    // a little fuzz on every fabric
    for (i = 0; i < (w * h) / 60; i++) {
      g.fillStyle = "rgba(255,240,210," + rnd(0, 0.08) + ")";
      g.fillRect(x + rnd(0, w), y + rnd(0, h), 1, 1);
    }
    g.restore();
  }
  function drawPatchwork(ctx, W, H, rects, gx0, gy0, u) {
    ctx.fillStyle = FAB_CHAR;
    ctx.fillRect(0, 0, W, H);
    var cols = Math.ceil((W - gx0) / u) + 1,
      rows = Math.ceil((H - gy0) / u) + 1;
    var used = [];
    for (var r = 0; r < rows; r++) used.push(new Uint8Array(cols));
    rects.forEach(function (s) {
      var c0 = Math.round((s.x - gx0) / u),
        r0 = Math.round((s.y - gy0) / u);
      for (var y = r0; y < Math.min(rows, r0 + Math.round(s.h / u)); y++)
        for (var x = c0; x < Math.min(cols, c0 + Math.round(s.w / u)); x++) if (y >= 0 && x >= 0) used[y][x] = 1;
    });
    var colour = [];
    var types = ["plaid", "plaid", "gingham", "tweed", "tweed", "cord", "herring", "star", "plain"];
    for (r = 0; r < rows; r++) {
      colour.push([]);
      for (var c = 0; c < cols; c++) {
        var near = [c > 0 ? colour[r][c - 1] : null, r > 0 ? colour[r - 1][c] : null];
        var key;
        do key = pick(FAB_KEYS);
        while (near.indexOf(key) >= 0);
        colour[r].push(key);
        if (used[r][c]) continue;
        var t = pick(types);
        var base = t === "star" ? pick([FAB.oat, FAB.mustard, FAB.olive]) : FAB[key];
        var x0 = gx0 + c * u,
          y0 = gy0 + r * u;
        drawPatch(ctx, x0 + 2, y0 + 2, u - 4, u - 4, base, t);
        blanketStitch(ctx, x0 + 2, y0 + 2, u - 4);
      }
    }
    // the large patches that hold text: plain dark fabric with a stitched inner border
    var plateCols = [FAB.navy, FAB.wine, FAB.forest, FAB.brown, FAB.slate];
    rects.forEach(function (s, i) {
      var col = plateCols[i % plateCols.length];
      drawPatch(ctx, s.x + 2, s.y + 2, s.w - 4, s.h - 4, col, "tweed");
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = FAB_CREAM;
      ctx.lineWidth = 2;
      ctx.strokeRect(s.x + 12, s.y + 12, s.w - 24, s.h - 24);
      ctx.restore();
      ctx.strokeStyle = FAB_CREAM;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (var tt = 6; tt < s.w - 3; tt += 9) {
        ctx.moveTo(s.x + tt, s.y + 3);
        ctx.lineTo(s.x + tt, s.y + 8);
        ctx.moveTo(s.x + tt, s.y + s.h - 3);
        ctx.lineTo(s.x + tt, s.y + s.h - 8);
      }
      for (tt = 6; tt < s.h - 3; tt += 9) {
        ctx.moveTo(s.x + 3, s.y + tt);
        ctx.lineTo(s.x + 8, s.y + tt);
        ctx.moveTo(s.x + s.w - 3, s.y + tt);
        ctx.lineTo(s.x + s.w - 8, s.y + tt);
      }
      ctx.stroke();
    });
  }

  // warm, blurry backdrop seen through the amber glass: sky, ochre earth, a little green
  function makeWarmBackdrop(fw, fh) {
    var c = makeCanvas(fw, fh);
    var g = c.getContext("2d");
    var bg = g.createLinearGradient(0, 0, 0, fh);
    bg.addColorStop(0, "#d9e3ea");
    bg.addColorStop(0.35, "#e8c98e");
    bg.addColorStop(0.6, "#9a5a22");
    bg.addColorStop(1, "#3a2410");
    g.fillStyle = bg;
    g.fillRect(0, 0, fw, fh);
    var cols = ["#dbe6ef", "#f4e7c8", "#c8862c", "#7a4318", "#2e1c0c", "#7a8f3a", "#a9c07a", "#ffb347"];
    for (var i = 0; i < (fw * fh) / 2500; i++) {
      var x = rnd(0, fw),
        y = rnd(0, fh),
        r = rnd(20, 110);
      var rg = g.createRadialGradient(x, y, 0, x, y, r);
      var col = pick(cols);
      rg.addColorStop(0, col);
      rg.addColorStop(1, "rgba(0,0,0,0)");
      g.globalAlpha = rnd(0.25, 0.7);
      g.fillStyle = rg;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.globalAlpha = 1;
    var out = makeCanvas(fw, fh);
    var o = out.getContext("2d");
    if (supportsFilter) o.filter = "blur(4px)";
    o.drawImage(c, 0, 0);
    return out;
  }

  // ============================================================ KEYCAPS and MACHINES
  // Both are painted once on the CPU into a page-sized colour map (half resolution,
  // so they come out pixelated like the rest). Machines also paint a mask of the
  // screens and a blurred glow map for the shader's flicker and bloom.
  var KEY_COLS = ["#e9e4d8", "#e4dece", "#dcd5c2", "#d2cab4", "#cdc9bf", "#c5c0b2", "#e6e2d6", "#bdb9ae"];
  var KEY_LEGENDS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    .split("")
    .concat([
      "Esc",
      "Tab",
      "Ctrl",
      "Alt",
      "Del",
      "Ins",
      "Home",
      "End",
      "PgUp",
      "PgDn",
      "F1",
      "F2",
      "F5",
      "F8",
      "F11",
      "F12",
      "←",
      "↑",
      "→",
      "↓",
      "?",
      "/",
      ";",
      "[",
      "]",
      "*",
      "+",
      "-",
    ]);
  var KEY_PAIRS = [
    ["!", "1"],
    ["@", "2"],
    ["#", "3"],
    ["$", "4"],
    ["%", "5"],
    ["^", "6"],
    ["&", "7"],
    ["*", "8"],
    ["(", "9"],
    [")", "0"],
    [":", ";"],
    ["?", "/"],
    [">", "."],
    ["<", ","],
  ];
  var KEY_WIDE = ["Enter", "Shift", "Backspace", "Caps Lock", "Space", "Print Screen", "Num Lock", "Tab", "Ctrl", "Alt Gr", "Insert", "Scroll Lock"];

  function keycap(g, x, y, w, h, col, legend, small) {
    var m = 3;
    // skirt: the sloped sides, darker towards the bottom right
    var skirt = g.createLinearGradient(x, y, x + w * 0.3, y + h);
    skirt.addColorStop(0, fshade(col, 0.92));
    skirt.addColorStop(1, fshade(col, 0.66));
    g.fillStyle = "rgba(0,0,0,0.5)";
    roundRect(g, x + m + 1, y + m + 2, w - 2 * m, h - 2 * m, 7);
    g.fill();
    g.fillStyle = skirt;
    roundRect(g, x + m, y + m, w - 2 * m, h - 2 * m, 7);
    g.fill();
    // top face, set back from the bottom edge so the front slope shows
    var tx = x + m + 5,
      ty = y + m + 3,
      tw = w - 2 * m - 10,
      th = h - 2 * m - 12;
    var dish = g.createRadialGradient(tx + tw * 0.5, ty + th * 0.55, 2, tx + tw * 0.5, ty + th * 0.5, Math.max(tw, th) * 0.75);
    dish.addColorStop(0, fshade(col, 0.95));
    dish.addColorStop(1, fshade(col, 1.06));
    g.fillStyle = dish;
    roundRect(g, tx, ty, tw, th, 5);
    g.fill();
    g.strokeStyle = "rgba(255,255,255,0.35)";
    g.lineWidth = 1;
    roundRect(g, tx + 0.5, ty + 0.5, tw - 1, th - 1, 5);
    g.stroke();
    // grime and yellowing
    for (var i = 0; i < 5; i++) {
      if (R() < 0.45) continue;
      var gx = tx + rnd(0, tw),
        gy = ty + rnd(0, th),
        gr = rnd(3, 12);
      var gg = g.createRadialGradient(gx, gy, 0, gx, gy, gr);
      gg.addColorStop(0, "rgba(110,85,50," + rnd(0.08, 0.28) + ")");
      gg.addColorStop(1, "rgba(110,85,50,0)");
      g.fillStyle = gg;
      g.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
    }
    if (!legend) return;
    g.fillStyle = col === "#e3c34a" || col === "#2a9d9a" ? "#1f1f1c" : "#3a3a35";
    g.textBaseline = "top";
    if (Array.isArray(legend)) {
      g.font = "600 13px 'Pixelify Sans', monospace";
      g.fillText(legend[0], tx + 5, ty + 3);
      g.fillText(legend[1], tx + 5, ty + th - 17);
    } else if (legend.length > 2 || small) {
      g.font = "500 11px 'Pixelify Sans', monospace";
      g.fillText(legend, tx + 5, ty + 4);
    } else {
      g.font = "600 17px 'Pixelify Sans', monospace";
      g.fillText(legend, tx + 6, ty + 3);
    }
  }

  function paintKeys(g, blocks, W, H) {
    g.fillStyle = "#24231f";
    g.fillRect(0, 0, W, H);
    blocks.forEach(function (b) {
      if (b.plate) {
        keycap(g, b.x, b.y, b.w, b.h, pick(["#e9e4d8", "#e4dece", "#dcd5c2"]), null);
        return;
      }
      var col = R() < 0.05 ? pick(["#e3c34a", "#2a9d9a", "#8fa3b8"]) : pick(KEY_COLS);
      var legend;
      if (b.cw >= 2) legend = pick(KEY_WIDE);
      else if (b.ch >= 2) legend = pick(["Enter", "+", "Ins"]);
      else legend = R() < 0.3 ? pick(KEY_PAIRS) : pick(KEY_LEGENDS);
      keycap(g, b.x, b.y, b.w, b.h, col, legend);
    });
  }

  var BEIGE = ["#d8d0b8", "#cfc6ab", "#e0d9c4", "#c4bba0", "#d2cbb6", "#bdb6a3"];
  var SCREEN = [
    ["#3a6dff", 0.4],
    ["#4f9dff", 0.12],
    ["#38f06a", 0.3],
    ["#ffb53a", 0.05],
    ["#101410", 0.13],
  ];
  function pickScreen() {
    var t = R(),
      a = 0;
    for (var i = 0; i < SCREEN.length; i++) {
      a += SCREEN[i][1];
      if (t < a) return SCREEN[i][0];
    }
    return SCREEN[0][0];
  }
  function beigeBox(g, x, y, w, h, col, r) {
    var gr = g.createLinearGradient(x, y, x, y + h);
    gr.addColorStop(0, fshade(col, 1.06));
    gr.addColorStop(1, fshade(col, 0.8));
    g.fillStyle = "rgba(0,0,0,0.45)";
    roundRect(g, x + 2, y + 3, w, h, r);
    g.fill();
    g.fillStyle = gr;
    roundRect(g, x, y, w, h, r);
    g.fill();
    g.strokeStyle = "rgba(255,255,255,0.35)";
    g.lineWidth = 1;
    roundRect(g, x + 0.5, y + 0.5, w - 1, h - 1, r);
    g.stroke();
    // a little grime
    for (var i = 0; i < 3; i++) {
      var gx = x + rnd(0, w),
        gy = y + rnd(0, h),
        gr2 = rnd(6, 20);
      var gg = g.createRadialGradient(gx, gy, 0, gx, gy, gr2);
      gg.addColorStop(0, "rgba(90,75,50," + rnd(0.05, 0.15) + ")");
      gg.addColorStop(1, "rgba(90,75,50,0)");
      g.fillStyle = gg;
      g.fillRect(gx - gr2, gy - gr2, gr2 * 2, gr2 * 2);
    }
  }
  function monitor(g, mk, gl2, x, y, w, h, screen, plate) {
    var col = pick(BEIGE);
    var standH = plate ? 0 : Math.min(h * 0.12, 18);
    beigeBox(g, x + 3, y + 3, w - 6, h - 6 - standH, col, 8);
    if (standH) {
      g.fillStyle = fshade(col, 0.82);
      g.fillRect(x + w * 0.3, y + h - standH - 4, w * 0.4, standH);
    }
    var bz = plate ? 26 : Math.max(8, Math.min(w, h) * 0.13);
    var sx = x + 3 + bz,
      sy = y + 3 + bz * 0.8,
      sw = w - 6 - 2 * bz,
      sh = h - 6 - standH - bz * 1.8;
    // recessed bezel
    g.fillStyle = fshade(col, 0.7);
    roundRect(g, sx - 4, sy - 4, sw + 8, sh + 8, 10);
    g.fill();
    // the tube: rounded, darker in the corners, a glare at the top left
    g.fillStyle = screen;
    roundRect(g, sx, sy, sw, sh, 12);
    g.fill();
    var vg = g.createRadialGradient(sx + sw / 2, sy + sh / 2, Math.min(sw, sh) * 0.2, sx + sw / 2, sy + sh / 2, Math.max(sw, sh) * 0.72);
    vg.addColorStop(0, "rgba(255,255,255,0.12)");
    vg.addColorStop(1, "rgba(0,0,0,0.55)");
    g.fillStyle = vg;
    roundRect(g, sx, sy, sw, sh, 12);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.18)";
    g.beginPath();
    g.ellipse(sx + sw * 0.28, sy + sh * 0.2, sw * 0.22, sh * 0.08, -0.3, 0, TAU);
    g.fill();
    mk.fillStyle = "#fff";
    roundRect(mk, sx, sy, sw, sh, 12);
    mk.fill();
    if (screen !== "#101410") {
      // soft light spilling from the tube; screens add up where they are close
      var gcx = sx + sw / 2,
        gcy = sy + sh / 2,
        gr3 = Math.max(sw, sh) * 1.05;
      var rg = gl2.createRadialGradient(gcx, gcy, Math.min(sw, sh) * 0.25, gcx, gcy, gr3);
      var n2 = parseInt(screen.slice(1), 16);
      var rgb = ((n2 >> 16) & 255) + "," + ((n2 >> 8) & 255) + "," + (n2 & 255);
      rg.addColorStop(0, "rgba(" + rgb + "," + (plate ? 0.15 : 0.4) + ")");
      rg.addColorStop(1, "rgba(" + rgb + ",0)");
      gl2.save();
      gl2.globalCompositeOperation = "lighter";
      gl2.fillStyle = rg;
      gl2.fillRect(gcx - gr3, gcy - gr3, gr3 * 2, gr3 * 2);
      gl2.restore();
    }
    // badge, power button and LED under the screen
    if (!plate) {
      var by = sy + sh + bz * 0.35;
      g.fillStyle = fshade(col, 0.7);
      g.fillRect(sx, by, Math.min(26, sw * 0.25), 3);
      g.beginPath();
      g.arc(sx + sw - 6, by + 2, 3, 0, TAU);
      g.fill();
      g.fillStyle = screen === "#101410" ? "#5a3a1a" : "#6cff7a";
      g.fillRect(sx + sw - 16, by + 1, 3, 3);
    }
  }
  function tower(g, x, y, w, h) {
    var col = pick(BEIGE);
    beigeBox(g, x + 3, y + 3, w - 6, h - 6, col, 5);
    var bays = Math.max(2, Math.floor(h / 30));
    for (var i = 0; i < bays; i++) {
      var yy = y + 10 + i * 13;
      if (yy > y + h * 0.5) break;
      g.fillStyle = fshade(col, 0.72);
      g.fillRect(x + 10, yy, w - 20, 9);
      g.fillStyle = "#2a2722";
      g.fillRect(x + 14, yy + 4, w * 0.4, 2);
    }
    g.fillStyle = fshade(col, 0.7);
    for (var v = y + h * 0.62; v < y + h - 12; v += 5) g.fillRect(x + 12, v, w - 24, 2);
    g.beginPath();
    g.arc(x + w / 2, y + h * 0.56, 5, 0, TAU);
    g.fill();
    g.fillStyle = "#6cff7a";
    g.fillRect(x + w - 16, y + h * 0.56 - 1, 3, 3);
  }
  function desktopCase(g, x, y, w, h) {
    var col = pick(BEIGE);
    beigeBox(g, x + 3, y + 3, w - 6, h - 6, col, 4);
    g.fillStyle = fshade(col, 0.7);
    g.fillRect(x + w * 0.08, y + h * 0.35, w * 0.22, h * 0.14);
    g.fillRect(x + w * 0.08, y + h * 0.6, w * 0.22, h * 0.1);
    g.fillStyle = "#2a2722";
    g.fillRect(x + w * 0.1, y + h * 0.4, w * 0.18, 2);
    g.fillStyle = fshade(col, 0.72);
    for (var v = x + w * 0.45; v < x + w * 0.85; v += 6) g.fillRect(v, y + h * 0.3, 2, h * 0.45);
    g.fillStyle = "#ffb53a";
    g.fillRect(x + w - 18, y + h * 0.5, 4, 3);
  }
  function retroKeyboard(g, x, y, w, h) {
    var col = pick(BEIGE);
    beigeBox(g, x + 3, y + h * 0.2, w - 6, h * 0.7, col, 4);
    g.fillStyle = fshade(col, 1.05);
    for (var ky = y + h * 0.28; ky < y + h * 0.82; ky += 7)
      for (var kx = x + 8; kx < x + w - 10; kx += 8) {
        g.fillStyle = fshade(col, R() < 0.1 ? 0.8 : 1.04);
        g.fillRect(kx, ky, 6, 5);
      }
  }
  function paintRetro(g, mk, gl2, blocks, W, H) {
    g.fillStyle = "#1b1a17";
    g.fillRect(0, 0, W, H);
    mk.fillStyle = "#000";
    mk.fillRect(0, 0, W, H);
    blocks.forEach(function (b) {
      if (b.plate) return monitor(g, mk, gl2, b.x, b.y, b.w, b.h, "#071a0c", true);
      var a = b.cw / b.ch;
      if (b.cw >= 2 && b.ch >= 2 && a <= 1.6 && a >= 0.9) monitor(g, mk, gl2, b.x, b.y, b.w, b.h, pickScreen(), false);
      else if (b.ch > b.cw) tower(g, b.x, b.y, b.w, b.h);
      else if (b.cw >= 4 && R() < 0.5) retroKeyboard(g, b.x, b.y, b.w, b.h);
      else desktopCase(g, b.x, b.y, b.w, b.h);
    });
  }

  // ============================================================ maps for the shaders
  function h2(x, y) {
    var n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y) {
    var xi = Math.floor(x),
      yi = Math.floor(y),
      xf = x - xi,
      yf = y - yi;
    var a = h2(xi, yi),
      b = h2(xi + 1, yi),
      c = h2(xi, yi + 1),
      d = h2(xi + 1, yi + 1);
    var u = xf * xf * (3 - 2 * xf),
      v = yf * yf * (3 - 2 * yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function smooth(a, b, x) {
    var t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }

  // --- glass: the dense, soft leaf wall from the first version (opaque, far)
  function makeFarFoliage(fw, fh) {
    var fol = makeCanvas(fw, fh);
    var f = fol.getContext("2d");
    var bg = f.createLinearGradient(0, 0, fw, fh);
    bg.addColorStop(0, "#14301c");
    bg.addColorStop(0.5, "#0c2213");
    bg.addColorStop(1, "#1a3a20");
    f.fillStyle = bg;
    f.fillRect(0, 0, fw, fh);
    var leaves = Math.floor((fw * fh) / 70);
    for (var i = 0; i < leaves; i++) {
      var depth = i / leaves;
      var x = rnd(-20, fw + 20),
        y = rnd(-20, fh + 20);
      var len = rnd(5, 18) * (0.6 + depth);
      f.fillStyle = "hsla(" + rnd(85, 135) + "," + rnd(28, 58) + "%," + (rnd(9, 24) + depth * 26) + "%," + rnd(0.55, 0.95) + ")";
      f.save();
      f.translate(x, y);
      f.rotate(rnd(0, TAU));
      f.beginPath();
      f.moveTo(-len, 0);
      f.quadraticCurveTo(0, -len * 0.42, len, 0);
      f.quadraticCurveTo(0, len * 0.42, -len, 0);
      f.fill();
      f.restore();
    }
    for (i = 0; i < leaves / 40; i++) {
      var lx = rnd(0, fw),
        ly = rnd(0, fh),
        lr = rnd(2, 9);
      var lg = f.createRadialGradient(lx, ly, 0, lx, ly, lr);
      lg.addColorStop(0, "rgba(230,245,200,0.5)");
      lg.addColorStop(1, "rgba(230,245,200,0)");
      f.fillStyle = lg;
      f.fillRect(lx - lr, ly - lr, lr * 2, lr * 2);
    }
    var out = makeCanvas(fw, fh);
    var o = out.getContext("2d");
    if (supportsFilter) o.filter = "blur(1.2px)";
    o.drawImage(fol, 0, 0);
    return out;
  }

  // --- glass: a few closer branches with proper leaves (transparent, near)
  function makeNearFoliage(fw, fh) {
    var c = makeCanvas(fw, fh);
    var g = c.getContext("2d");
    var area = (fw * fh) / (860 * 540);
    var layer = { leaf: 24, light: 30, sunny: 0.3, detail: true, twig: "#3d3820" };
    var n = Math.max(6, Math.round(22 * area));
    for (var b = 0; b < n; b++) {
      drawBranch(g, rnd(-0.1, 1.1) * fw, rnd(-0.1, 1.1) * fh, rnd(3, 7) * layer.leaf, rnd(0, TAU), layer.leaf * rnd(0.8, 1.3), layer);
    }
    return c;
  }

  // --- glass: height field (R) + frost amount (G) as floats
  // ============================================================ content slots
  // A page is a vertical sequence of units: a single .slot, or a .slot-row whose
  // children are slots laid side by side. Everything is snapped to the
  // background's grid so each slot becomes one glass plate / cartouche / tile.
  var units = [];
  var slotEls = [];
  function wrapInner(e) {
    var first = e.firstElementChild;
    if (first && first.classList.contains("slot-inner") && first === e.lastElementChild) return;
    var inner = document.createElement("div");
    inner.className = "slot-inner";
    while (e.firstChild) inner.appendChild(e.firstChild);
    e.appendChild(inner);
  }
  function collectSlots() {
    var main = document.querySelector('[role="main"]');
    if (!main) return [];
    [].slice.call(main.querySelectorAll("ol.bibliography")).forEach(function (ol) {
      ol.classList.add("slot-row");
      ol.setAttribute("data-cols", "1");
    });
    [].slice.call(main.querySelectorAll(".slot-row")).forEach(function (r) {
      [].slice.call(r.children).forEach(function (c) {
        c.classList.add("slot");
        c.setAttribute("data-in-row", "");
      });
    });
    var cand = [].slice.call(main.querySelectorAll(".slot, .slot-row"));
    [].slice.call(main.querySelectorAll(".slot-auto")).forEach(function (a) {
      if (!a.querySelector(".slot, .slot-row") && a.textContent.trim()) cand.push(a);
    });
    var top = cand.filter(function (e) {
      return (
        !e.hasAttribute("data-in-row") &&
        !(e.classList.contains("slot-row") && !e.children.length) &&
        !cand.some(function (o) {
          return o !== e && o.contains(e);
        })
      );
    });
    if (!top.length && main.firstElementChild) top = [main.firstElementChild];
    top.sort(function (a, b) {
      return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    units = top.map(function (e) {
      if (e.classList.contains("slot-row")) return { row: e, items: [].slice.call(e.children) };
      e.classList.add("slot");
      return { el: e };
    });
    var all = [];
    units.forEach(function (un) {
      (un.items || [un.el]).forEach(function (s) {
        wrapInner(s);
        all.push(s);
      });
    });
    return all;
  }

  function needH(e) {
    var st = getComputedStyle(e);
    return e.firstElementChild.offsetHeight + parseFloat(st.paddingTop) + parseFloat(st.paddingBottom);
  }

  // gaps are in grid units: between units (vertical), and inside rows
  function snapSlots(u, gapUnits, gapCol, gapRow, maxW, oneCol, leftPx) {
    var main = document.querySelector('[role="main"]');
    var cs = getComputedStyle(main);
    var innerW = main.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var K = Math.max(2, Math.floor(Math.min(innerW, maxW || 1e9) / u));
    var width = K * u;
    var minUnits = Math.max(2, Math.ceil(250 / u));
    units.forEach(function (un) {
      var e = un.el || un.row;
      e.style.width = width + "px";
      if (leftPx !== undefined) {
        var ml = leftPx - (main.getBoundingClientRect().left + window.scrollX + parseFloat(cs.paddingLeft));
        e.style.marginLeft = ml + "px";
        e.style.marginRight = "0";
      } else {
        e.style.marginLeft = "auto";
        e.style.marginRight = "auto";
      }
      e.style.marginTop = "0px";
      e.style.marginBottom = "0px";
      if (un.el) {
        e.style.height = Math.ceil(needH(e) / u) * u + "px";
        return;
      }
      var n = un.items.length;
      var auto = Math.max(1, Math.floor((K + gapCol) / (minUnits + gapCol)));
      var want = parseInt(e.getAttribute("data-cols") || "0", 10) || n;
      var per = oneCol ? 1 : Math.max(1, Math.min(n, want, auto));
      var base = Math.floor((K - gapCol * (per - 1)) / per);
      var extra = K - gapCol * (per - 1) - base * per;
      var colsPx = [];
      for (var i = 0; i < per; i++) colsPx.push((base + (i < extra ? 1 : 0)) * u + "px");
      e.style.display = "grid";
      e.style.gridTemplateColumns = colsPx.join(" ");
      e.style.columnGap = gapCol * u + "px";
      e.style.rowGap = gapRow * u + "px";
      e.style.alignItems = "start";
      e.style.padding = "0";
      e.style.listStyle = "none";
      un.items.forEach(function (s) {
        s.style.height = "auto";
        s.style.margin = "0";
      });
      for (var r0 = 0; r0 < n; r0 += per) {
        var rowItems = un.items.slice(r0, r0 + per);
        var hMax = 0;
        rowItems.forEach(function (s) {
          hMax = Math.max(hMax, needH(s));
        });
        var hh = Math.ceil(hMax / u) * u + "px";
        rowItems.forEach(function (s) {
          s.style.height = hh;
        });
      }
    });

    var rects = [],
      oy = 0,
      ox = 0,
      prevBottom = 0;
    units.forEach(function (un, i) {
      var e = un.el || un.row;
      var r = e.getBoundingClientRect();
      var top = r.top + window.scrollY;
      if (i === 0) {
        oy = top;
        ox = r.left + window.scrollX;
      } else {
        var want = Math.max(prevBottom + gapUnits * u, top);
        want = oy + Math.ceil((want - oy - 0.5) / u) * u;
        for (var tries = 0; tries < 3; tries++) {
          var d = want - top;
          if (Math.abs(d) < 0.5) break;
          e.style.marginTop = parseFloat(e.style.marginTop || 0) + d + "px";
          top = e.getBoundingClientRect().top + window.scrollY;
        }
      }
      (un.items || [un.el]).forEach(function (s) {
        var sr = s.getBoundingClientRect();
        rects.push({ x: sr.left + window.scrollX, y: sr.top + window.scrollY, w: sr.width, h: sr.height });
      });
      prevBottom = e.getBoundingClientRect().bottom + window.scrollY;
    });
    var docH = Math.max(document.documentElement.scrollHeight, window.innerHeight);
    return { rects: rects, ox: ox, oy: oy, docH: docH };
  }

  // Glass / tiles: blocks of different widths placed at varying positions with
  // varying space between them, packed down the page in reading order.
  function scatterSlots(u, maxW) {
    var main = document.querySelector('[role="main"]');
    var vw = document.documentElement.clientWidth;
    var leftV = Math.max(20, Math.round(vw * 0.045));
    var K = Math.max(3, Math.floor(Math.min(vw - leftV - 12, maxW) / u));
    var mobile = K < 5;
    main.style.position = "relative";
    main.style.height = "";
    var mr = main.getBoundingClientRect();
    var mainLeft = mr.left + window.scrollX,
      mainTop = mr.top + window.scrollY;
    var areaLeft = leftV + window.scrollX;
    var top0 = Math.round(mainTop);
    var occ = [];
    function rowOcc(r) {
      while (occ.length <= r) occ.push(new Uint8Array(K));
      return occ[r];
    }
    function free(c, r, w, h) {
      for (var y = Math.max(0, r - 1); y <= r + h; y++) {
        var row = rowOcc(y);
        for (var x = Math.max(0, c - 1); x <= Math.min(K - 1, c + w); x++) if (row[x]) return false;
      }
      return true;
    }
    var firstCol = 0,
      prevBottom = 0;
    var cursor = 0,
      maxRow = 0,
      rects = [];
    var minW = Math.max(2, Math.ceil(360 / u));
    slotEls.forEach(function (e, i) {
      var chars = e.textContent.replace(/\s+/g, " ").trim().length;
      var lo = clamp(Math.ceil(Math.sqrt(chars * 110) / u), minW, K);
      if (i === 0) lo = Math.max(lo, Math.min(K, Math.ceil(K * 0.72)));
      var hi = Math.min(K, lo + (chars > 250 ? 3 : 2));
      e.style.position = "absolute";
      e.style.margin = "0";
      e.style.height = "auto";
      var w = K,
        h = 1,
        best = 1e9;
      for (var tw = mobile ? K : lo; tw <= (mobile ? K : hi); tw++) {
        e.style.width = tw * u + "px";
        var need = needH(e);
        var th = Math.max(1, Math.ceil(need / u));
        var waste = (th * u * tw * u - need * tw * u) / (tw * u * u) + (tw - lo) * 0.12 + R() * 0.35;
        if (waste < best) {
          best = waste;
          w = tw;
          h = th;
        }
      }
      e.style.width = w * u + "px";
      // usually start below the previous block; now and then sit beside it
      var besideChance = w <= K * 0.5 ? 0.6 : 0.22;
      var r = i === 0 ? 0 : R() < besideChance ? cursor : prevBottom + (R() < 0.4 ? 1 : 0);
      // grouped blocks (e.g. roles at one organisation) only share rows with their own group:
      // a new group starts below everything placed so far
      var grp = e.getAttribute("data-group");
      var prevGrp = i > 0 ? slotEls[i - 1].getAttribute("data-group") : null;
      if (i > 0 && (grp || prevGrp) && grp !== prevGrp) r = maxRow + (R() < 0.5 ? 1 : 0);
      var c = 0;
      for (var guard = 0; guard < 400; guard++, r++) {
        var cands = [];
        for (var cc = i === 0 ? 0 : firstCol; cc + w <= K; cc++) if (free(cc, r, w, h)) cands.push(cc);
        if (cands.length) {
          var reach = Math.min(cands.length, i === 0 ? 1 : 3);
          c = cands[Math.floor(Math.pow(R(), 3) * reach)];
          break;
        }
      }
      for (var y = r; y < r + h; y++) {
        var row = rowOcc(y);
        // the first block claims its whole row band, so nothing sits beside it
        for (var x = i === 0 ? 0 : c; x < (i === 0 ? K : c + w); x++) row[x] = 1;
      }
      cursor = r;
      prevBottom = r + h;
      if (i === 0) firstCol = c;
      maxRow = Math.max(maxRow, r + h);
      var px = areaLeft + c * u,
        py = top0 + r * u;
      e.style.left = px - mainLeft + "px";
      e.style.top = py - mainTop + "px";
      e.style.height = h * u + "px";
      rects.push({ x: px, y: py, w: w * u, h: h * u });
    });
    main.style.height = (maxRow + 1) * u + "px";
    var docH = Math.max(document.documentElement.scrollHeight, window.innerHeight);
    return { rects: rects, ox: areaLeft, oy: top0, docH: docH };
  }

  // grid of cells; each cell stores which block covers it (two RGBA texels per cell)
  function buildIndex(W, docH, u, lay, fill) {
    var gx0 = lay.ox - u * Math.ceil(lay.ox / u),
      gy0 = lay.oy - u * Math.ceil(lay.oy / u);
    if (!lay.rects.length) {
      gx0 = 0;
      gy0 = 0;
    }
    var cols = Math.ceil((W - gx0) / u) + 1,
      rows = Math.ceil((docH - gy0) / u) + 2;
    var used = [];
    for (var r = 0; r < rows; r++) used.push(new Uint8Array(cols));
    var blocks = [];
    lay.rects.forEach(function (s, i) {
      var c0 = Math.round((s.x - gx0) / u),
        r0 = Math.round((s.y - gy0) / u),
        cw = Math.round(s.w / u),
        ch = Math.round(s.h / u);
      for (var y = r0; y < Math.min(rows, r0 + ch); y++) for (var x = c0; x < Math.min(cols, c0 + cw); x++) used[y][x] = 1;
      blocks.push({ c: c0, r: r0, w: cw, h: ch, plate: true, i: i });
    });
    fill(used, cols, rows, blocks);
    var data = new Uint8Array(cols * 2 * rows * 4);
    blocks.forEach(function (b) {
      var meta = b.meta || [0, 0, 0, 0];
      for (var y = b.r; y < Math.min(rows, b.r + b.h); y++) {
        for (var x = b.c; x < Math.min(cols, b.c + b.w); x++) {
          var o = (y * cols * 2 + x * 2) * 4;
          data[o] = x - b.c;
          data[o + 1] = Math.min(255, y - b.r);
          data[o + 2] = b.w;
          data[o + 3] = Math.min(255, b.h);
          data[o + 4] = meta[0];
          data[o + 5] = meta[1];
          data[o + 6] = meta[2];
          data[o + 7] = meta[3];
        }
      }
    });
    return { data: data, cols: cols, rows: rows, gx0: gx0, gy0: gy0, blocks: blocks };
  }

  function packBlocks(used, cols, rows, blocks, shapes, metaFn) {
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        if (used[r][c]) continue;
        var opts = shapes.filter(function (sh) {
          if (c + sh[0] > cols || r + sh[1] > rows) return false;
          for (var yy = 0; yy < sh[1]; yy++) for (var xx = 0; xx < sh[0]; xx++) if (used[r + yy][c + xx]) return false;
          return true;
        });
        if (!opts.length) opts = [[1, 1, 1]];
        var tot = opts.reduce(function (a, o) {
          return a + o[2];
        }, 0);
        var t = R() * tot,
          ch = opts[0];
        for (var k = 0; k < opts.length; k++) {
          t -= opts[k][2];
          if (t <= 0) {
            ch = opts[k];
            break;
          }
        }
        for (var dy = 0; dy < ch[1]; dy++) for (var dx = 0; dx < ch[0]; dx++) used[r + dy][c + dx] = 1;
        var b = { c: c, r: r, w: ch[0], h: ch[1] };
        b.meta = metaFn(b);
        blocks.push(b);
      }
    }
  }

  // ============================================================ shaders
  var VS = "#version 300 es\nin vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
  var COMMON = `#version 300 es
precision highp float;
uniform vec2 uCss;uniform vec2 uRes;uniform float uDpr;uniform vec2 uMouse;uniform float uHover;uniform float uTime;uniform float uTop;uniform float uScrollY;uniform vec2 uView;
uniform sampler2D uIdx;uniform vec2 uOrg;uniform float uU;uniform vec2 uGrid;
uniform vec4 uHov;uniform float uHovAmt;uniform float uHovInset;uniform float uHovR;
out vec4 outColor;
vec2 P(){return vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y)/uDpr;}
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
float vig(vec2 p){return 1.;}
// a hovered block is drawn a little bigger, lifted off the wall with a soft shadow
vec2 hoverWarp(vec2 w,out float lift,out float shade){
  lift=0.;shade=1.;
  if(uHovAmt<.001)return w;
  vec2 c=uHov.xy+uHov.zw*.5;
  float k=1.+.06*uHovAmt;
  vec2 q=c+(w-c)/k;
  vec2 hh=uHov.zw*.5-uHovInset;
  vec2 d=abs(q-c)-(hh-uHovR);
  if(length(max(d,0.))+min(max(d.x,d.y),0.)-uHovR<0.){lift=uHovAmt;return q;}
  vec2 sq=c+(w-vec2(7.,10.)*uHovAmt-c)/k;
  vec2 sd=abs(sq-c)-uHov.zw*.5;
  shade=1.-.5*uHovAmt*(1.-smoothstep(-4.,26.,max(sd.x,sd.y)));
  return w;
}
void cellInfo(vec2 w,out vec2 lp,out vec2 sz,out vec4 meta){
  vec2 c=clamp(floor((w-uOrg)/uU),vec2(0.),uGrid-1.);
  vec4 a=floor(texelFetch(uIdx,ivec2(int(c.x)*2,int(c.y)),0)*255.+.5);
  meta=floor(texelFetch(uIdx,ivec2(int(c.x)*2+1,int(c.y)),0)*255.+.5);
  lp=w-((c-a.xy)*uU+uOrg);
  sz=a.zw*uU;
}
`;

  var FS_GLASS =
    COMMON +
    `
uniform sampler2D uFar;uniform sampler2D uNear;uniform vec2 uFol;uniform float uMode;
float glassH(vec2 w,out float frost,out float plate,out float face,out float tid){
  vec2 lp,sz;vec4 meta;cellInfo(w,lp,sz,meta);
  // amber blocks overlap their neighbours a little: near an edge, the neighbour that
  // ranks higher reaches over and this pixel belongs to its rim instead
  float ext=0.;
  if(uMode>.5&&meta.x<6.5){
    float ov=6.;
    for(int k=0;k<4;k++){
      vec2 dir=k==0?vec2(-1.,0.):k==1?vec2(1.,0.):k==2?vec2(0.,-1.):vec2(0.,1.);
      vec2 lpN,szN;vec4 mN;cellInfo(w+dir*ov,lpN,szN,mN);
      if(distance(w+dir*ov-lpN,w-lp)>.5&&mN.x<6.5&&mN.y>meta.y){lp=lpN-dir*ov;sz=szN;meta=mN;ext=ov;break;}
    }
  }
  tid=meta.w;
  float type=meta.x,seed=meta.y;frost=meta.z/255.;plate=step(6.5,type);
  float r1=hash(vec2(seed,2.)),r2=hash(vec2(seed,3.));
  float e=plate>.5?22.:uMode>.5?clamp(min(sz.x,sz.y)*.17,12.,24.):clamp(min(sz.x,sz.y)*(.1+.04*r1),9.,18.);
  float d=min(min(lp.x,lp.y),min(sz.x-lp.x,sz.y-lp.y))-.6;
  if(uMode>.5){
    float su=sin(3.1416*clamp(lp.x/sz.x,0.,1.)),sv=sin(3.1416*clamp(lp.y/sz.y,0.,1.));
    float b1=.5+2.5*hash(vec2(seed,11.)),b2=.5+2.5*hash(vec2(seed,12.)),b3=.5+2.5*hash(vec2(seed,13.)),b4=.5+2.5*hash(vec2(seed,14.));
    d=min(min(lp.y-b1*su,sz.y-lp.y-b2*su),min(lp.x-b3*sv,sz.x-lp.x-b4*sv))-.6+ext;
  }
  d+=(vn(vec2(seed*7.3+(lp.x+lp.y)*.05,seed))-.5)*1.3;
  float rim=1.-pow(1.-smoothstep(0.,e*.75,d),2.);
  float inner=smoothstep(e*.8,e*1.35,d);
  face=inner;
  vec2 f=lp-e;
  float pat;
  if(type<1.5){
    float cell=type<.5?mix(15.,21.,r1):mix(20.,27.,r1);
    float an=(type<.5?.7854:0.)+(r2-.5)*.06;
    vec2 uv=mat2(cos(an),sin(an),-sin(an),cos(an))*f/cell;
    vec2 q=fract(uv)-.5;pat=1.-2.*max(abs(q.x),abs(q.y));
  }else if(type<2.5){float t=fract(f.x/mix(9.,14.,r1))*2.-1.;pat=sqrt(max(0.,1.-t*t));}
  else if(type<3.5){pat=.5+.5*sin(f.y*mix(.05,.09,r1)+sin(f.x*.03+r2*6.28)*1.6);}
  else if(type<4.5){pat=.5+.5*cos(length(lp-sz*vec2(mix(.3,.7,r1),mix(.3,.7,r2)))*.42);}
  else if(type<5.5){vec2 q=(lp-sz*.5)/sz*2.;float dd=dot(q,q);pat=clamp(1.-dd,0.,1.)*.7+vn(lp*.04+seed)*.5;}
  else{pat=vn(lp*.008+seed)*.6+vn(lp*.03+seed*2.)*.2;}
  if(uMode>.5){
    // every block has its own pressed-glass surface, all slowly moving
    float pk=floor(hash(vec2(seed,5.))*5.);
    vec2 dq=lp-sz*.5;float rr=length(dq);float tt=uTime;
    if(pk<.5)pat=vn(lp*.016+seed)*.6+vn(lp*.045+seed*3.)*.35+.15*sin(lp.x*.03+lp.y*.022+tt*.5+seed);
    else if(pk<1.5){vec2 o=vec2(sin(tt*.2+seed),cos(tt*.17+seed))*6.;pat=vn((lp+o)*.07+seed)*.7+vn((lp-o)*.15+seed*2.)*.35;}
    else if(pk<2.5)pat=.5+.5*sin(atan(dq.y,dq.x)*2.+rr*.07+tt*.3+seed)*smoothstep(4.,34.,rr)+vn(lp*.03+seed)*.2;
    else if(pk<3.5)pat=.5+.5*sin(lp.y*mix(.05,.09,r1)+sin(lp.x*.035+tt*.45+seed)*2.4);
    else pat=.5+.5*cos(rr*.22-tt*.8+seed);
  }
  float h=rim*.85-inner*.27+inner*pat*(plate>.5?(uMode>.5?.16:.1):(uMode>.5?.44:.2))+(vn(w*.025+seed)-.5)*.07;
  return d>.5?h:0.;
}
void main(){
  vec2 p=P();vec2 w=p+vec2(0.,uTop);vec2 pv=w-vec2(0.,uScrollY);
  float lift,hs;w=hoverWarp(w,lift,hs);
  float frost,plate,face;
  float tid;
  float h=glassH(w,frost,plate,face,tid);
  vec3 n=normalize(vec3(-dFdx(h)*uDpr*9.6,dFdy(h)*uDpr*9.6,1.));
  float t=uTime;
  vec2 sway=vec2(sin(w.y*.011+t*.9)+.6*sin(w.y*.027+w.x*.006+t*1.7),.7*cos(w.x*.009+t*.7+w.y*.004))*4.;
  vec2 par=(uMouse/uView-.5)*uHover;
  vec2 refr=-n.xy*42.;
  float edge=1.-n.z;
  float lod=frost*3.2+edge*2.5;
  vec2 fp=pv+vec2(0.,uScrollY*.35);
  if(uMode>.5)fp+=vec2(sin(fp.y*.006+t*.35)+.6*sin(fp.y*.017+fp.x*.004+t*.6),cos(fp.x*.005+t*.28)+.5*cos(fp.x*.013-fp.y*.006+t*.5))*42.;
  vec3 far=textureLod(uFar,(fp+refr*1.5+sway*.5-par*12.)/uFol,lod+.6).rgb;
  vec4 nr=textureLod(uNear,(fp+vec2(0.,uScrollY*.15)+refr+sway*1.4-par*28.)/uFol,lod);
  vec3 col=mix(far,nr.rgb,nr.a);
  if(uMode>.5){
    // amber: clear coloured glass, every block its own tint, rims deeper in colour
    int ti=int(tid+.5);
    vec3 tint=ti==0?vec3(1.,.52,.1):ti==1?vec3(1.,.76,.28):ti==2?vec3(.62,.32,.14):ti==3?vec3(.58,.74,.4):ti==4?vec3(.74,.58,.42):vec3(.98,.86,.66);
    if(plate>.5)tint=vec3(.6,.3,.1);
    col=col*tint*(1.3+.3*edge);
    col=mix(col,col*col*1.7,.28);
    col*=mix(1.,.6,min(edge*2.,1.));
    col=mix(col,col*.55,plate*face*.55);
  }else{
    vec3 tint=vec3(.55,.8,.48);
    col*=mix(vec3(1.),tint,.2+min(edge*2.6,.65));
    // milky glass: light scatters inside, leaves only show as soft shapes
    col=mix(col,vec3(.6,.7,.55)*(.85+.3*dot(col,vec3(.6))),frost*.5*(1.-plate*.8));
    col=mix(col,col*.72+vec3(.02,.05,.03),plate*face*.55);
  }
  vec3 key=normalize(vec3(-.45,-.6,1.));
  col*=.8+.26*dot(n,key);
  vec3 V=vec3(0.,0.,1.);
  vec3 Lm=normalize(vec3(uMouse-pv,230.));
  float sm=pow(max(dot(n,normalize(Lm+V)),0.),50.)*.13*uHover;
  float sk=pow(max(dot(n,normalize(key+V)),0.),36.)*(.05+uMode*.2);
  sm*=1.+uMode*1.5;
  col+=mix(vec3(.8,.92,.7),vec3(1.,.94,.82),uMode)*(sm+sk);
  col*=mix(.12,1.,smoothstep(0.,.05,h));
  col*=hs*(1.+.07*lift);
  outColor=vec4(col*vig(p),1.);
}`;

  var FS_RUG =
    COMMON +
    `
uniform sampler2D uAlb;uniform vec2 uAlbSize;uniform float uKnot;uniform vec2 uKOrg;uniform sampler2D uText;
float lobe(vec2 f){vec2 q=f-.5;return clamp(1.-length(vec2((abs(q.x)-.22)*2.4,q.y*1.5)),0.,1.);}
void main(){
  vec2 p=P();vec2 w=p+vec2(0.,uTop)-uKOrg;
  vec2 g=w/uKnot;vec2 cell=floor(g);vec2 f=fract(g)-vec2(0.,.05);
  vec3 c=texture(uAlb,(cell+.5)/uAlbSize).rgb;
  // text is woven in: its thread colour replaces the pile colour, then gets the same knot shading
  // washed, worn look of an old rug: soft lighter patches and fibre wear
  float wear=smoothstep(.5,.95,vn(w*.0035+7.))*.5+vn(w*.04)*.12;
  c=mix(c,vec3(.86,.72,.62),wear*.3);
  // each knot under a letter takes the thread colour, in proportion to how much of
  // the knot the letter covers; on light grounds the thread is dark indigo
  // the pattern is woven in coarse knots, the letters at full resolution
  vec4 tx=texture(uText,p/uCss);
  float ta=tx.a;
  float gl=dot(c,vec3(.3,.59,.11));
  vec3 thread=gl>.58?vec3(.11,.14,.27):tx.rgb;
  c=mix(c,thread,ta);
  float lb=lobe(f);
  float dx=lobe(f+vec2(.08,0.))-lobe(f-vec2(.08,0.));
  float dy=lobe(f+vec2(0.,.08))-lobe(f-vec2(0.,.08));
  vec3 n=normalize(vec3(-dx*2.5,-dy*2.5,1.));
  vec3 L=normalize(vec3(-.3,-.7,.65));
  float shade=(.6+.4*lb)*(.84+.26*max(dot(n,L),0.));
  shade*=.93+.14*hash(cell);
  shade*=.95+.08*hash(vec2(floor(cell.y/7.),floor(cell.x/180.)));
  shade*=.93+.12*hash(vec2(floor(w.x*uDpr*1.3),floor(w.y*.3)));
  shade=mix(shade,.96,ta*.9);
  outColor=vec4(c*shade*vig(p),1.);
}`;

  var FS_TILES =
    COMMON +
    `
uniform sampler2D uAtlas;uniform vec2 uAtlasGrid;uniform float uGrout;uniform vec3 uPlate[5];
vec3 design(float id,vec2 uv){
  vec2 ac=vec2(mod(id,uAtlasGrid.x),floor(id/uAtlasGrid.x));
  return texture(uAtlas,(ac+clamp(uv,.004,.996))/uAtlasGrid).rgb;
}
void main(){
  vec2 p=P();vec2 w=p+vec2(0.,uTop);
  float lift,hs;w=hoverWarp(w,lift,hs);
  vec2 lp,sz;vec4 meta;cellInfo(w,lp,sz,meta);
  float plate=step(6.5,meta.x);float seed=meta.w;
  float g=uGrout;vec2 q=lp-g*.5;vec2 s=sz-g;
  float rr=plate>.5?10.:s.x*.07;
  float bev=plate>.5?16.:s.x*.13;
  vec2 hq=abs(q-s*.5)-(s*.5-rr);
  float sd=length(max(hq,0.))+min(max(hq.x,hq.y),0.)-rr;
  float tt=clamp(-sd/bev,0.,1.);
  float tile=step(sd,0.);
  float h=mix(-.12+vn(w*.5)*.05,
    1.-pow(1.-tt,2.4)+(vn(q*.05+seed)-.5)*.05+dot(q-s*.5,vec2(hash(vec2(seed,1.))-.5,hash(vec2(seed,2.))-.5))*.0012,tile);
  vec3 alb;
  if(plate<.5){
    alb=design(meta.y,q/s);
  }else{
    // deep majolica glaze with an embossed frame and relief corner bosses
    float de=min(min(q.x,q.y),min(s.x-q.x,s.y-q.y));
    vec3 base=uPlate[int(meta.y)];
    alb=base*(.82+.3*vn(q*.012+seed))*(.95+.1*vn(q*.15));
    float ridge=smoothstep(6.,9.,de)*(1.-smoothstep(13.,16.,de));
    float bead=smoothstep(20.,21.5,de)*(1.-smoothstep(22.5,24.,de));
    alb=mix(alb,base*1.7+.03,ridge*.85);
    alb=mix(alb,base*1.5+.02,bead*.85);
    float cs=min(uU*.3,34.);
    vec2 cq=vec2(min(q.x,s.x-q.x),min(q.y,s.y-q.y));
    if(cq.x>4.&&cq.y>4.&&cq.x<cs+4.&&cq.y<cs+4.)alb=design(meta.z,(cq-4.)/cs);
  }
  alb*=tile>.5?1.:0.;
  alb+=(1.-tile)*vec3(.09,.14,.09)*(.8+.4*vn(w*.7));
  float lum=dot(alb,vec3(.3,.59,.11));
  float face=smoothstep(.85,.98,h);
  vec2 dh=vec2(dFdx(h),-dFdy(h))*uDpr;
  vec2 dl=vec2(dFdx(lum),-dFdy(lum))*uDpr;
  vec3 n=normalize(vec3(-(dh*11.+dl*3.*face),1.));
  vec3 key=normalize(vec3(-.5,-.65,1.));
  vec3 col=alb*(.4+.62*max(dot(n,key),0.));
  // grout: recessed, in the shade of its tile on the far side from the light
  float ao=mix(.72,1.,smoothstep(0.,g*.7,sd));
  float shadowSide=step(s.x,q.x)+step(s.y,q.y);
  col*=mix(1.,ao*(1.-.25*min(shadowSide,1.)),1.-tile);
  vec3 V=vec3(0.,0.,1.);
  float sp=pow(max(dot(n,normalize(key+V)),0.),60.)*.45*(1.-smoothstep(.97,1.,n.z));
  vec3 r=reflect(-V,n);
  float env=smoothstep(.15,.5,dot(r.xy,normalize(vec2(-.6,-.8))))*.08;
  col+=tile*(vec3(1.,.97,.9)*sp+env);
  col*=hs*(1.+.07*lift);
  outColor=vec4(col*vig(p),1.);
}`;

  // epoxy tiles: a thick glossy clear coat over shiny undersides (crumpled foil,
  // mother of pearl, worn printed lace, deep dark), all in blues
  var FS_PEARL =
    COMMON +
    `
uniform sampler2D uAtlas;uniform vec2 uAtlasGrid;uniform float uGrout;
vec3 design(float id,vec2 uv){
  vec2 ac=vec2(mod(id,uAtlasGrid.x),floor(id/uAtlasGrid.x));
  return textureLod(uAtlas,(ac+clamp(uv,.004,.996))/uAtlasGrid,1.).rgb;
}
float ridged(vec2 p){
  float v=0.,a=.55;
  for(int i=0;i<3;i++){v+=a*(1.-abs(vn(p)*2.-1.));p*=1.9;a*=.5;}
  return v;
}
vec3 pal(float i){
  i=mod(floor(i+.5),8.);
  return i<.5?vec3(.08,.13,.3):i<1.5?vec3(.15,.32,.58):i<2.5?vec3(.48,.68,.84):i<3.5?vec3(.2,.4,.66):
    i<4.5?vec3(.1,.36,.44):i<5.5?vec3(.05,.07,.14):i<6.5?vec3(.34,.5,.7):vec3(.28,.4,.62);
}
void main(){
  vec2 p=P();vec2 w=p+vec2(0.,uTop);
  float lift,hs;w=hoverWarp(w,lift,hs);
  vec2 lp,sz;vec4 meta;cellInfo(w,lp,sz,meta);
  float plate=step(6.5,meta.x);
  vec2 cellId=floor((w-uOrg)/uU);
  float seed=plate>.5?meta.w:hash(cellId)*255.;
  float g=uGrout;vec2 q=lp-g*.5;vec2 s=sz-g;
  float rr=plate>.5?10.:s.x*.08;
  float bev=plate>.5?18.:s.x*.18;
  vec2 hq=abs(q-s*.5)-(s*.5-rr);
  float sd=length(max(hq,0.))+min(max(hq.x,hq.y),0.)-rr;
  float tt=clamp(-sd/bev,0.,1.);
  float tile=step(sd,0.);
  // the coat: a thick, slightly uneven pillow of resin
  float h=mix(-.12,1.-pow(1.-tt,2.)+(vn(q*.03+seed)-.5)*.06,tile);
  vec2 dh=vec2(dFdx(h),-dFdy(h))*uDpr;
  vec3 nC=normalize(vec3(-dh*13.,1.));
  // what lies beneath, seen through the coat (a little refracted)
  vec2 uq=q+nC.xy*8.;
  float cr=ridged(uq*mix(.009,.02,hash(vec2(seed,4.)))+seed*.37);
  vec2 dc=vec2(dFdx(cr),-dFdy(cr))*uDpr;
  vec3 nU=normalize(vec3(-dc*14.,1.));
  vec3 pd=design(meta.w,clamp(uq/s,0.,1.));
  float kind=plate>.5?0.:floor(meta.z+.5);
  vec3 base=plate>.5?vec3(.06,.12,.27):pal(meta.y);
  vec3 key=normalize(vec3(-.5,-.65,1.));
  vec3 V=vec3(0.,0.,1.);
  float lit=.5+.65*max(dot(nU,key),0.);
  float sheen=pow(max(dot(nU,normalize(key+V)),0.),16.);
  // calmer under the text
  lit=mix(lit,.85,plate*.7);
  sheen*=1.-plate*.7;
  vec3 alb=base*lit+sheen*.38*mix(vec3(.82,.9,1.),base*1.8,.35);
  if(kind>.5&&kind<1.5){
    // mother of pearl: iridescent, changing with the crinkles
    // pastel, cool colour shift like the inside of a shell
    vec3 irid=vec3(.5,.62,.84)+.2*cos(6.2832*(cr*1.1+vn(uq*.012+seed)*.6+vec3(0.,.33,.67)))*vec3(.7,.8,1.);
    alb=mix(alb,irid*(.72+.48*lit),.72);
  }else if(kind>1.5&&kind<2.5){
    // a printed pattern under the coat, worn away in places
    float m=1.-dot(pd,vec3(.333));
    m*=smoothstep(.25,.75,vn(uq*.045+seed)+.25);
    alb=mix(alb,vec3(.55,.7,.88)*(.75+.35*lit),clamp(m*1.2,0.,.8));
  }else if(kind>2.5){
    alb*=.4;
  }
  // grout
  alb=mix(vec3(.1,.13,.18)*(.8+.3*vn(w*.6)),alb,tile);
  float ao=mix(.55,1.,smoothstep(0.,g*.7,sd));
  // the coat itself: glossy, brighter at glancing angles, a soft window reflection
  vec3 col=alb*(.86+.2*max(dot(nC,key),0.));
  col*=mix(ao,1.,tile);
  float spec=pow(max(dot(nC,normalize(key+V)),0.),150.)*.75+pow(max(dot(nC,normalize(key+V)),0.),28.)*.07;
  vec3 rf=reflect(-V,nC);
  float env=smoothstep(.12,.42,dot(rf.xy,normalize(vec2(-.6,-.8))))*.14;
  float fres=pow(1.-nC.z,2.)*.5;
  col+=tile*(vec3(1.,1.,1.)*spec+vec3(.85,.92,1.)*(env+fres));
  col*=hs*(1.+.06*lift);
  outColor=vec4(col*vig(p),1.);
}`;

  // painted worlds (keycaps, machines): colour map + hover lift; machines add
  // CRT scanlines, flicker, a rolling bar and screen glow
  var FS_PAINT =
    COMMON +
    `
uniform sampler2D uAlb;uniform sampler2D uMask;uniform sampler2D uGlow;uniform vec2 uAlbSize;uniform float uAlbScale;uniform float uMode;
void main(){
  vec2 p=P();vec2 w=p+vec2(0.,uTop);
  float lift,hs;w=hoverWarp(w,lift,hs);
  vec2 uv=w*uAlbScale/uAlbSize;
  vec3 col=texture(uAlb,uv).rgb;
  if(uMode>.5){
    float m=texture(uMask,uv).r;
    // each screen flickers on its own beat
    vec2 cid=floor(w/vec2(150.,130.));
    float ph=hash(cid)*6.2832;
    float t=uTime;
    float fl=.9+.05*sin(t*53.+ph)+.05*hash(vec2(floor(t*18.+ph),cid.x));
    float scan=.78+.22*sin(w.y*2.1);
    float roll=smoothstep(.0,.06,fract(w.y/420.-t*.12+ph))*(1.-smoothstep(.06,.14,fract(w.y/420.-t*.12+ph)));
    col=mix(col,col*fl*scan+col*roll*.25,m);
    vec3 glow=texture(uGlow,uv).rgb;
    col+=glow*(.32*fl)*(1.-m*.7);
  }
  col*=hs*(1.+.06*lift);
  outColor=vec4(col*vig(p),1.);
}`;

  // ============================================================ driver
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var gl = null,
    prog = null,
    uni = {},
    units = {},
    css = { w: 0, h: 0 },
    dpr = 1,
    cache = {};

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function setTex(name, make) {
    if (!(name in units)) units[name] = Object.keys(units).length;
    gl.activeTexture(gl.TEXTURE0 + units[name]);
    var t = cache["tex_" + name];
    if (t) gl.deleteTexture(t);
    t = gl.createTexture();
    cache["tex_" + name] = t;
    gl.bindTexture(gl.TEXTURE_2D, t);
    make(t);
    gl.uniform1i(gl.getUniformLocation(prog, name), units[name]);
  }
  function params(minF, wrap) {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minF);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, minF === gl.NEAREST ? gl.NEAREST : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  }
  function texFromCanvas(name, c, mip, wrap) {
    setTex(name, function () {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      if (mip) gl.generateMipmap(gl.TEXTURE_2D);
      params(mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR, wrap || gl.CLAMP_TO_EDGE);
    });
  }
  function u1(n, v) {
    gl.uniform1f(gl.getUniformLocation(prog, n), v);
  }
  function u2(n, a, b) {
    gl.uniform2f(gl.getUniformLocation(prog, n), a, b);
  }

  // render pixels are 2x2 css px: chunky pixels, and a quarter of the work
  var PIX = kind === "rug" || kind === "fabric" ? 1 : 0.5;
  var win = { top: -1, h: 0, docH: 0 };
  var textCanvas = null;

  // The canvas is a window about two viewports tall that scrolls with the page,
  // so the browser moves it together with the text. Near its edges it is moved
  // and redrawn in the scroll handler.
  function sizeWindow(docH) {
    win.docH = docH;
    var vh = window.innerHeight;
    win.h = Math.min(Math.round((vh * 2.2) / 2) * 2, Math.floor(docH / 2) * 2);
    canvas.style.height = win.h + "px";
    canvas.width = Math.round(css.w * PIX);
    canvas.height = Math.round(win.h * PIX);
    gl.viewport(0, 0, canvas.width, canvas.height);
    win.top = -1;
  }
  function ensureWindow() {
    var sy = window.scrollY,
      vh = window.innerHeight;
    var margin = vh * 0.25;
    var roomAbove = sy - win.top,
      roomBelow = win.top + win.h - (sy + vh);
    var needAbove = Math.min(margin, win.top),
      needBelow = Math.min(margin, win.docH - win.top - win.h);
    if (win.top >= 0 && roomAbove >= needAbove && roomBelow >= needBelow) return false;
    var top = clamp(Math.round((sy - (win.h - vh) / 2) / 2) * 2, 0, Math.max(0, win.docH - win.h));
    if (top === win.top) return false;
    win.top = top;
    canvas.style.top = top + "px";
    if (kind === "rug" || kind === "fabric") drawWovenText();
    return true;
  }

  function textBoxes() {
    var out = [],
      sx = window.scrollX,
      sy = window.scrollY;
    var range = document.createRange();
    slotEls.forEach(function (slot) {
      var lines = {};
      var walker = document.createTreeWalker(slot, NodeFilter.SHOW_TEXT);
      var node;
      while ((node = walker.nextNode())) {
        if (!node.data.trim()) continue;
        range.selectNodeContents(node);
        [].forEach.call(range.getClientRects(), function (r) {
          if (r.width < 1) return;
          var key = Math.round((r.top + r.bottom) / 8);
          var L = lines[key];
          if (!L) lines[key] = [r.left + sx, r.top + sy, r.right + sx, r.bottom + sy];
          else {
            L[0] = Math.min(L[0], r.left + sx);
            L[1] = Math.min(L[1], r.top + sy);
            L[2] = Math.max(L[2], r.right + sx);
            L[3] = Math.max(L[3], r.bottom + sy);
          }
        });
      }
      Object.keys(lines).forEach(function (k) {
        var L = lines[k];
        out.push([L[0] - 8, L[1] - 3, L[2] + 8, L[3] + 3]);
      });
      [].slice.call(slot.querySelectorAll("li")).forEach(function (li) {
        var lr = li.getBoundingClientRect();
        var fs = parseFloat(getComputedStyle(li).fontSize);
        out.push([lr.left + sx - fs * 1.2, lr.top + sy, lr.left + sx, lr.top + sy + fs * 1.4]);
      });
    });
    return out;
  }

  // paint the page's text into a texture so the rug can weave it
  function drawWovenText() {
    var W = css.w,
      H = win.h;
    if (!textCanvas) textCanvas = makeCanvas(W, H);
    if (textCanvas.width !== W || textCanvas.height !== H) {
      textCanvas.width = W;
      textCanvas.height = H;
    }
    var g = textCanvas.getContext("2d");
    g.clearRect(0, 0, W, H);
    var sx = window.scrollX,
      sy = window.scrollY;
    var range = document.createRange();
    var wordRe = /\S+/g;
    var marks = [];
    slotEls.forEach(function (slot) {
      var sr = slot.getBoundingClientRect();
      if (sr.bottom + sy < win.top || sr.top + sy > win.top + H) return;
      var walker = document.createTreeWalker(slot, NodeFilter.SHOW_TEXT);
      var node;
      while ((node = walker.nextNode())) {
        var el = node.parentElement;
        if (!el) continue;
        var st = getComputedStyle(el);
        var font = st.fontStyle + " " + st.fontWeight + " " + st.fontSize + " " + st.fontFamily;
        g.font = font;
        wordRe.lastIndex = 0;
        var mt;
        while ((mt = wordRe.exec(node.data))) {
          range.setStart(node, mt.index);
          range.setEnd(node, mt.index + mt[0].length);
          var rr = range.getClientRects();
          if (!rr.length) continue;
          var r = rr[0];
          var y = r.top + sy - win.top;
          if (y > H || y + r.height < 0) continue;
          var tm = g.measureText(mt[0]);
          var asc = tm.fontBoundingBoxAscent || r.height * 0.8,
            desc = tm.fontBoundingBoxDescent || r.height * 0.2;
          marks.push({ t: mt[0], x: r.left + sx, y: y + (r.height - asc - desc) / 2 + asc, font: font, color: st.color });
        }
      }
      [].slice.call(slot.querySelectorAll("li")).forEach(function (li) {
        var lr = li.getBoundingClientRect();
        var ls = getComputedStyle(li);
        var fs = parseFloat(ls.fontSize);
        marks.push({ box: [lr.left + sx - fs * 0.8, lr.top + sy - win.top + fs * 0.5, fs * 0.36], color: ls.color });
      });
    });
    // pass 2: the thread colour itself
    marks.forEach(function (mk) {
      g.fillStyle = mk.color;
      if (mk.box) return g.fillRect(mk.box[0], mk.box[1], mk.box[2], mk.box[2]);
      g.font = mk.font;
      g.fillText(mk.t, mk.x, mk.y);
    });
    texFromCanvas("uText", textCanvas, false);
  }

  function rugTextColumn(u) {
    if (css.w < RUG_SPLIT) return [u, 3, 2, 2, 690, true, Math.round(clamp(css.w * 0.065, 40, 104) + 64)];
    // the text runs across the whole screen, starting just inside the left rug's border
    var c = rugColumns(css.w)[0];
    var B = clamp(c.w * 0.075, 46, 116);
    return [u, 3, 2, 2, 690, true, Math.round(c.x + B + 64)];
  }

  var unitSize = 0;
  function gridUnit(W) {
    if (kind === "glass") return Math.round(W < 576 ? clamp(W / 5, 60, 90) : clamp(Math.min(W, 1400) / 8.5, 72, 140));
    if (kind === "tiles") return Math.round(W < 576 ? clamp(W / 5, 60, 90) : clamp(Math.min(W, 1600) / 11, 78, 136));
    if (kind === "keys") return Math.round(W < 576 ? clamp(W / 8, 40, 54) : clamp(Math.min(W, 1600) / 24, 48, 62));
    if (kind === "retro") return Math.round(W < 576 ? clamp(W / 7, 44, 60) : clamp(Math.min(W, 1600) / 20, 56, 76));
    if (kind === "pearl") return Math.round(W < 576 ? clamp(W / 5, 60, 90) : clamp(Math.min(W, 1600) / 11, 76, 124));
    if (kind === "amber") return Math.round(W < 576 ? clamp(W / 5, 60, 90) : clamp(Math.min(W, 1600) / 12, 72, 112));
    if (kind === "fabric") return Math.round((W < 576 ? clamp(W / 5, 60, 90) : clamp(Math.min(W, 1600) / 12, 72, 114)) / 3) * 3;
    return 24;
  }

  // viewport-sized resources (foliage, atlas): only rebuilt when the viewport changes
  function buildViewport() {
    var W = canvas.clientWidth,
      H = canvas.clientHeight;
    if (!W || !H) return false;
    css = { w: W, h: H };
    dpr = PIX;
    unitSize = gridUnit(W);
    if (!gl) return true;
    if (kind === "glass" || kind === "amber") {
      R = mulberry32(kind === "amber" ? 31 : 7);
      var fw = Math.ceil(W * 0.6),
        fh = Math.ceil(H * 0.6);
      u1("uMode", kind === "amber" ? 1 : 0);
      texFromCanvas("uFar", kind === "amber" ? makeWarmBackdrop(fw, fh) : makeFarFoliage(fw, fh), true, gl.MIRRORED_REPEAT);
      texFromCanvas("uNear", kind === "amber" ? makeCanvas(4, 4) : makeNearFoliage(fw, fh), true, gl.MIRRORED_REPEAT);
      u2("uFol", W, H);
    } else if ((kind === "tiles" || kind === "pearl") && !cache.atlas) {
      R = mulberry32(23);
      var D = 192,
        ag = [8, 5];
      var atlas = makeCanvas(D * ag[0], D * ag[1]);
      var ac = atlas.getContext("2d");
      var k = 0;
      TILE_NAMES.forEach(function (nm) {
        for (var i = 0; i < 4; i++, k++) ac.drawImage(tileDesign(D, nm, pick(MOTIFS)), (k % ag[0]) * D, Math.floor(k / ag[0]) * D);
      });
      cache.atlas = atlas;
      texFromCanvas("uAtlas", atlas, true);
      u2("uAtlasGrid", ag[0], ag[1]);
      gl.uniform3fv(
        gl.getUniformLocation(prog, "uPlate"),
        [0.07, 0.22, 0.11, 0.34, 0.06, 0.08, 0.23, 0.25, 0.08, 0.06, 0.21, 0.17, 0.25, 0.12, 0.06]
      );
    }
    return true;
  }

  // page-sized resources: layout, block index, rug colours
  function buildWorld() {
    var W = css.w;
    var u = unitSize;
    R = mulberry32({ glass: 7, rug: 11, tiles: 23, amber: 31, fabric: 41, pearl: 53, keys: 61, retro: 71 }[kind] + 101);
    var lay = kind === "rug" ? snapSlots.apply(null, rugTextColumn(u)) : scatterSlots(u, 1240);
    worldRects = lay.rects;
    if (!gl) return;
    sizeWindow(lay.docH);
    if (kind === "fabric") {
      var kf = 3;
      var fox = ((lay.ox % kf) + kf) % kf,
        foy = ((lay.oy % kf) + kf) % kf;
      var maxTf = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      var fwid = Math.ceil(W / kf) + 1,
        fhei = Math.min(maxTf, Math.ceil(lay.docH / kf) + 1);
      var falb = makeCanvas(fwid, fhei);
      var fctx = falb.getContext("2d");
      fctx.scale(1 / kf, 1 / kf);
      fctx.translate(-fox, -foy);
      var fgx0 = lay.ox - u * Math.ceil(lay.ox / u),
        fgy0 = lay.oy - u * Math.ceil(lay.oy / u);
      drawPatchwork(fctx, W, lay.docH, lay.rects, fgx0, fgy0, u);
      texFromCanvas("uAlb", falb, false);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      u2("uAlbSize", fwid, fhei);
      u1("uKnot", kf);
      u2("uKOrg", fox, foy);
      ensureWindow();
      return;
    }
    if (kind === "rug") {
      var k = 3;
      var kox = ((lay.ox % k) + k) % k,
        koy = ((lay.oy % k) + k) % k;
      var maxT = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      var aw = Math.ceil(W / k) + 1,
        ah = Math.min(maxT, Math.ceil(lay.docH / k) + 1);
      var alb = makeCanvas(aw, ah);
      var ctx = alb.getContext("2d");
      ctx.scale(1 / k, 1 / k);
      ctx.translate(-kox, -koy);
      drawRugWorld(ctx, W, lay.docH, lay.rects, textBoxes());
      texFromCanvas("uAlb", alb, false);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      u2("uAlbSize", aw, ah);
      u1("uKnot", k);
      u2("uKOrg", kox, koy);
      ensureWindow();
      return;
    }
    var idx;
    if (kind === "keys" || kind === "retro") {
      var shapes =
        kind === "keys"
          ? [
              [1, 1, 10],
              [2, 1, 3],
              [3, 1, 1],
              [1, 2, 1],
              [4, 1, 0.5],
            ]
          : [
              [3, 3, 2],
              [2, 2, 2.5],
              [4, 3, 1],
              [2, 3, 1.5],
              [1, 2, 1],
              [3, 1, 1.5],
              [4, 1, 1],
              [2, 1, 1],
            ];
      var pidx = buildIndex(W, lay.docH, u, lay, function (used, cols, rows, blocks) {
        blocks.forEach(function (b) {
          b.meta = [7, 0, 0, 0];
        });
        packBlocks(used, cols, rows, blocks, shapes, function () {
          return [1, 0, 0, 0];
        });
      });
      var list = pidx.blocks.map(function (b) {
        return { x: pidx.gx0 + b.c * u, y: pidx.gy0 + b.r * u, w: b.w * u, h: b.h * u, cw: b.w, ch: b.h, plate: !!b.plate };
      });
      var sc = 0.5;
      var maxTp = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      var pw = Math.ceil(W * sc),
        ph = Math.min(maxTp, Math.ceil(lay.docH * sc));
      var ca = makeCanvas(pw, ph),
        cm = makeCanvas(pw, ph),
        cg = makeCanvas(pw, ph);
      var ga = ca.getContext("2d"),
        gm = cm.getContext("2d"),
        gg = cg.getContext("2d");
      [ga, gm, gg].forEach(function (c2) {
        c2.scale(sc, sc);
      });
      if (kind === "keys") paintKeys(ga, list, W, lay.docH);
      else paintRetro(ga, gm, gg, list, W, lay.docH);
      texFromCanvas("uAlb", ca, false);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      texFromCanvas("uMask", cm, false);
      texFromCanvas("uGlow", cg, false);
      u2("uAlbSize", pw, ph);
      u1("uAlbScale", sc);
      u1("uMode", kind === "retro" ? 1 : 0);
      u1("uHovInset", 3);
      u1("uHovR", 7);
      ensureWindow();
      return;
    }
    if (kind === "pearl") {
      idx = buildIndex(W, lay.docH, u, lay, function (used, cols, rows, blocks) {
        blocks.forEach(function (b) {
          b.meta = [7, 0, 0, Math.floor(R() * 255)];
        });
        // undersides: 0 foil, 1 mother of pearl, 2 printed pattern, 3 deep dark; neighbours differ in colour
        var colour = [];
        for (var r = 0; r < rows; r++) colour.push(new Int8Array(cols).fill(-1));
        for (r = 0; r < rows; r++) {
          for (var c = 0; c < cols; c++) {
            if (used[r][c]) continue;
            var near = [c > 0 ? colour[r][c - 1] : -1, r > 0 ? colour[r - 1][c] : -1];
            var pc;
            do pc = Math.floor(R() * 8);
            while (near.indexOf(pc) >= 0);
            colour[r][c] = pc;
            used[r][c] = 1;
            var tk = R();
            var under = tk < 0.4 ? 0 : tk < 0.65 ? 1 : tk < 0.85 ? 2 : 3;
            blocks.push({ c: c, r: r, w: 1, h: 1, meta: [0, pc, under, Math.floor(R() * 40)] });
          }
        }
      });
      u1("uGrout", Math.max(2, Math.round(u * 0.025)));
      u1("uHovInset", Math.max(2, Math.round(u * 0.025)) / 2);
      u1("uHovR", 10);
    } else if (kind === "amber") {
      u1("uHovInset", 1);
      u1("uHovR", 3);
      idx = buildIndex(W, lay.docH, u, lay, function (used, cols, rows, blocks) {
        blocks.forEach(function (b) {
          b.meta = [7, Math.floor(R() * 255), 30, 0];
        });
        packBlocks(used, cols, rows, blocks, [[1, 1, 1]], function () {
          return [6, Math.floor(R() * 255), Math.floor(rnd(0, 0.22) * 255), Math.floor(R() * 6)];
        });
      });
    } else if (kind === "glass") {
      u1("uHovInset", 1);
      u1("uHovR", 3);
      idx = buildIndex(W, lay.docH, u, lay, function (used, cols, rows, blocks) {
        blocks.forEach(function (b) {
          b.meta = [7, Math.floor(R() * 255), 235, 0];
        });
        var types = [0, 0, 1, 2, 2, 3, 5, 0, 2, 4, 3, 5];
        packBlocks(
          used,
          cols,
          rows,
          blocks,
          [
            [1, 1, 5],
            [2, 2, 3],
            [2, 1, 2],
            [1, 2, 2],
            [1, 3, 1],
          ],
          function () {
            return [pick(types), Math.floor(R() * 255), Math.floor(rnd(0.25, 0.9) * 255), 0];
          }
        );
      });
    } else {
      idx = buildIndex(W, lay.docH, u, lay, function (used, cols, rows, blocks) {
        blocks.forEach(function (b, i) {
          b.meta = [7, i % 5, Math.floor(R() * 40), Math.floor(R() * 255)];
        });
        // small tiles: neighbours never share a colour family
        var colour = [];
        for (var r = 0; r < rows; r++) colour.push(new Int8Array(cols).fill(-1));
        for (r = 0; r < rows; r++) {
          for (var c = 0; c < cols; c++) {
            if (used[r][c]) continue;
            var near = [];
            if (c > 0) near.push(colour[r][c - 1]);
            if (r > 0) {
              near.push(colour[r - 1][c]);
              if (c > 0) near.push(colour[r - 1][c - 1]);
              if (c < cols - 1) near.push(colour[r - 1][c + 1]);
            }
            var free = [];
            for (var ci = 0; ci < TILE_NAMES.length; ci++) if (near.indexOf(ci) < 0) free.push(ci);
            var cc = pick(free);
            colour[r][c] = cc;
            used[r][c] = 1;
            blocks.push({ c: c, r: r, w: 1, h: 1, meta: [0, cc * 4 + Math.floor(R() * 4), 0, Math.floor(R() * 255)] });
          }
        }
      });
      u1("uGrout", Math.max(2, Math.round(u * 0.025)));
      u1("uHovInset", Math.max(2, Math.round(u * 0.025)) / 2);
      u1("uHovR", 10);
    }
    setTex("uIdx", function () {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, idx.cols * 2, idx.rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, idx.data);
      params(gl.NEAREST, gl.CLAMP_TO_EDGE);
    });
    u2("uOrg", idx.gx0, idx.gy0);
    u1("uU", u);
    u2("uGrid", idx.cols, idx.rows);
    ensureWindow();
  }

  // pointer state (smoothed); only the glass reacts to it
  var m = { x: 0, y: 0, tx: 0, ty: 0, hover: 0, th: 0 };
  var hov = { el: null, i: -1, amt: 0, target: 0 };
  var worldRects = [];
  var raf = 0,
    last = 0,
    t0 = performance.now();

  function draw(ts) {
    gl.uniform2f(uni.uCss, css.w, win.h);
    gl.uniform2f(uni.uRes, canvas.width, canvas.height);
    gl.uniform1f(uni.uDpr, dpr);
    gl.uniform2f(uni.uMouse, m.x, m.y);
    gl.uniform1f(uni.uHover, m.hover);
    gl.uniform1f(uni.uTime, reduceMotion ? 0 : (ts - t0) / 1000);
    gl.uniform1f(uni.uTop, win.top);
    var hr = hov.el && worldRects[hov.i];
    gl.uniform4f(uni.uHov, hr ? hr.x : 0, hr ? hr.y : 0, hr ? hr.w : 0, hr ? hr.h : 0);
    gl.uniform1f(uni.uHovAmt, hr ? hov.amt : 0);
    gl.uniform1f(uni.uScrollY, window.scrollY);
    gl.uniform2f(uni.uView, css.w, window.innerHeight);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  var scrolled = true;
  function frame(ts) {
    raf = 0;
    if (document.hidden || !gl) return;
    var moving = false;
    if (hov.el) {
      // the text and the block grow in the same frame
      var dh = hov.target - hov.amt;
      if (Math.abs(dh) > 0.003) {
        hov.amt += dh * 0.22;
        moving = true;
      } else hov.amt = hov.target;
      var big = hov.amt > 0.001;
      hov.el.style.transform = big ? "scale(" + (1 + 0.06 * hov.amt).toFixed(4) + ")" : "";
      hov.el.style.zIndex = big ? "3" : "";
      if (!big && hov.target === 0) hov.el = null;
    }
    if (kind === "glass" || kind === "amber") {
      m.x += (m.tx - m.x) * 0.14;
      m.y += (m.ty - m.y) * 0.14;
      m.hover += (m.th - m.hover) * 0.08;
      moving = Math.abs(m.tx - m.x) > 0.3 || Math.abs(m.ty - m.y) > 0.3 || Math.abs(m.th - m.hover) > 0.005;
    }
    var animated = !reduceMotion && (kind === "glass" || kind === "amber" || kind === "retro");
    if (!moving && !scrolled && animated && ts - last < 33) {
      kick();
      return;
    }
    scrolled = false;
    draw(ts);
    last = ts;
    if (moving || animated) kick();
  }
  function kick() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function relayout() {
    // any relayout first makes sure the viewport resources match the current width:
    // the resize and content-size handlers share one timer, so either may run alone
    if (canvas.clientWidth !== css.w) buildViewport();
    buildWorld();
    scrolled = true;
    kick();
  }

  function init() {
    try {
      gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "low-power" });
    } catch (err) {
      gl = null;
    }
    if (gl) {
      try {
        prog = gl.createProgram();
        gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
        gl.attachShader(
          prog,
          compile(
            gl.FRAGMENT_SHADER,
            kind === "glass" || kind === "amber"
              ? FS_GLASS
              : kind === "rug" || kind === "fabric"
                ? FS_RUG
                : kind === "pearl"
                  ? FS_PEARL
                  : kind === "keys" || kind === "retro"
                    ? FS_PAINT
                    : FS_TILES
          )
        );
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
        gl.useProgram(prog);
        var buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        var loc = gl.getAttribLocation(prog, "a");
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        ["uCss", "uRes", "uDpr", "uMouse", "uHover", "uTime", "uTop", "uScrollY", "uView", "uHov", "uHovAmt"].forEach(function (n) {
          uni[n] = gl.getUniformLocation(prog, n);
        });
      } catch (err) {
        if (window.console) console.warn("backgrounds: WebGL unavailable, showing plain panels", err);
        gl = null;
      }
    }
    slotEls = collectSlots();
    if (!gl) {
      document.body.classList.add("bg-static");
      return;
    }
    if (!buildViewport()) {
      requestAnimationFrame(init);
      return;
    }
    buildWorld();
    m.x = m.tx = css.w * 0.5;
    m.y = m.ty = css.h * 0.35;
    document.body.classList.add("bg-live");
    if (kind !== "rug" && kind !== "fabric") {
      slotEls.forEach(function (e, i) {
        if (e.tagName !== "A") return;
        e.addEventListener("mouseenter", function () {
          if (hov.el && hov.el !== e) {
            hov.el.style.transform = "";
            hov.el.style.zIndex = "";
            hov.amt = 0;
          }
          hov.el = e;
          hov.i = i;
          hov.target = 1;
          kick();
        });
        e.addEventListener("mouseleave", function () {
          if (hov.el === e) {
            hov.target = 0;
            kick();
          }
        });
      });
    }
    canvas.classList.add("is-ready");
    kick();

    window.addEventListener(
      "scroll",
      function () {
        // move the window and redraw right away, in the same frame as the scroll
        if (ensureWindow()) draw(performance.now());
        if (kind === "glass") {
          scrolled = true;
          kick();
        }
      },
      { passive: true }
    );
    window.addEventListener(
      "pointermove",
      function (e) {
        if (kind !== "glass" && kind !== "amber") return;
        m.tx = e.clientX;
        m.ty = e.clientY;
        m.th = 1;
        kick();
      },
      { passive: true }
    );
    document.documentElement.addEventListener("mouseleave", function () {
      m.th = 0;
      kick();
    });
    document.addEventListener("visibilitychange", kick);

    var timer;
    function soon(fn, ms) {
      clearTimeout(timer);
      timer = setTimeout(fn, ms);
    }
    window.addEventListener("resize", function () {
      soon(function () {
        relayout();
      }, 200);
    });
    // content can change height after load (fonts, images)
    if (window.ResizeObserver) {
      var lastSig = "";
      var ro = new ResizeObserver(function () {
        var sig = slotEls
          .map(function (e) {
            return e.firstElementChild.offsetHeight + "x" + e.firstElementChild.offsetWidth;
          })
          .join(",");
        if (sig === lastSig) return;
        lastSig = sig;
        soon(relayout, 120);
      });
      slotEls.forEach(function (e) {
        ro.observe(e.firstElementChild);
      });
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
