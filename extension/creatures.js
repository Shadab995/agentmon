/*
 * AgentMon creatures — 6 original families x 3 evolution stages, drawn as SVG.
 * Pure functions, no DOM access, so the same file works in the content script,
 * the extension service worker, the popup, the demo page and Node.
 *
 * Want your own creatures? Add a family to FAMILIES and a feature painter to
 * FEATURES. Keep them original if you plan to sell this.
 */
(function (root) {
  'use strict';

  var FAMILIES = [
    { id: 'ember', type: 'Fire', shape: 'blob', stages: ['Cinder', 'Blazel', 'Pyrovex'],
      colors: { body: '#FF8A5B', light: '#FFB894', dark: '#DB5B3C', line: '#9E3420', belly: '#FFE3CC', accent: '#FF5A36', accent2: '#FFD166' } },
    { id: 'tide', type: 'Water', shape: 'drop', stages: ['Drip', 'Tidelet', 'Maelstro'],
      colors: { body: '#5BC0EB', light: '#A3E0F8', dark: '#3396C9', line: '#1D6A95', belly: '#E2F7FF', accent: '#2F8FD8', accent2: '#CDEFFF' } },
    { id: 'sprout', type: 'Leaf', shape: 'blob', stages: ['Budlet', 'Thicket', 'Verdanox'],
      colors: { body: '#8FD17E', light: '#BDEAAE', dark: '#5FAE52', line: '#3A7D33', belly: '#EEF9E6', accent: '#4CAF50', accent2: '#FF8FB1' } },
    { id: 'volt', type: 'Volt', shape: 'blob', stages: ['Zib', 'Zappit', 'Voltaro'],
      colors: { body: '#9C8CFF', light: '#C7BDFF', dark: '#7464E6', line: '#4B3DB3', belly: '#EEEAFF', accent: '#FFD43B', accent2: '#D99A00' } },
    { id: 'stone', type: 'Stone', shape: 'rock', stages: ['Pebb', 'Quartzle', 'Monolux'],
      colors: { body: '#B9AA9B', light: '#DCD2C7', dark: '#958473', line: '#6B5B4C', belly: '#EFE8E0', accent: '#6FD8CC', accent2: '#D2FFF8' } },
    { id: 'shade', type: 'Shade', shape: 'ghost', stages: ['Wispy', 'Shadeling', 'Noctyx'],
      colors: { body: '#8A86C2', light: '#B8B4E4', dark: '#6964A3', line: '#433E7A', belly: '#E6E4F8', accent: '#B98CFF', accent2: '#EFE4FF' } }
  ];

  var TYPE_COLORS = {
    Fire: { bg: '#FF6B3D', fg: '#FFFFFF' },
    Water: { bg: '#2F8FD8', fg: '#FFFFFF' },
    Leaf: { bg: '#3F9C47', fg: '#FFFFFF' },
    Volt: { bg: '#F2B705', fg: '#2B2200' },
    Stone: { bg: '#8D7B68', fg: '#FFFFFF' },
    Shade: { bg: '#7E57C2', fg: '#FFFFFF' }
  };

  // XP needed to reach stage 1, 2, 3. One tool call = 1 XP, a finished turn = 3 XP.
  var XP_STAGES = [0, 20, 60];

  // Body geometry per stage inside an 80x80 viewBox. Ground line is y = 74.
  var GEO = [
    { cx: 40, cy: 57, rx: 17, ry: 15 },
    { cx: 40, cy: 53, rx: 20, ry: 18.5 },
    { cx: 40, cy: 50, rx: 23, ry: 21.5 }
  ];

  var INK = '#1E1B2E';
  var counter = 0;

  function family(id) {
    for (var i = 0; i < FAMILIES.length; i++) if (FAMILIES[i].id === id) return FAMILIES[i];
    return FAMILIES[0];
  }
  function clampStage(s) { s = Math.round(Number(s) || 1); return s < 1 ? 1 : s > 3 ? 3 : s; }
  function stageForXp(xp) { xp = Number(xp) || 0; return xp >= XP_STAGES[2] ? 3 : xp >= XP_STAGES[1] ? 2 : 1; }
  function nextStageXp(stage) { stage = clampStage(stage); return stage >= 3 ? null : XP_STAGES[stage]; }
  function stageName(id, stage) { return family(id).stages[clampStage(stage) - 1]; }
  function n(v) { return Math.round(v * 100) / 100; }

  // ---------- shape helpers ----------
  function flame(x, y, w, h, tilt, outer, inner, line) {
    var hw = w / 2;
    var d = 'M' + n(x - hw) + ' ' + n(y) +
      ' C' + n(x - hw) + ' ' + n(y - h * 0.45) + ' ' + n(x - w * 0.05) + ' ' + n(y - h * 0.55) + ' ' + n(x + w * 0.08) + ' ' + n(y - h) +
      ' C' + n(x + w * 0.32) + ' ' + n(y - h * 0.62) + ' ' + n(x + hw) + ' ' + n(y - h * 0.42) + ' ' + n(x + hw) + ' ' + n(y) +
      ' C' + n(x + hw) + ' ' + n(y + w * 0.32) + ' ' + n(x - hw) + ' ' + n(y + w * 0.32) + ' ' + n(x - hw) + ' ' + n(y) + 'Z';
    var iw = w * 0.5, ih = h * 0.55, iy = y - 0.5, ihw = iw / 2;
    var di = 'M' + n(x - ihw) + ' ' + n(iy) +
      ' C' + n(x - ihw) + ' ' + n(iy - ih * 0.5) + ' ' + n(x) + ' ' + n(iy - ih * 0.6) + ' ' + n(x + iw * 0.1) + ' ' + n(iy - ih) +
      ' C' + n(x + iw * 0.35) + ' ' + n(iy - ih * 0.6) + ' ' + n(x + ihw) + ' ' + n(iy - ih * 0.4) + ' ' + n(x + ihw) + ' ' + n(iy) +
      ' C' + n(x + ihw) + ' ' + n(iy + iw * 0.4) + ' ' + n(x - ihw) + ' ' + n(iy + iw * 0.4) + ' ' + n(x - ihw) + ' ' + n(iy) + 'Z';
    return '<g transform="rotate(' + tilt + ' ' + n(x) + ' ' + n(y) + ')"><g class="flick">' +
      '<path d="' + d + '" fill="' + outer + '" stroke="' + line + '" stroke-width="1.4" stroke-linejoin="round"/>' +
      '<path d="' + di + '" fill="' + inner + '"/></g></g>';
  }

  function leaf(x, y, len, wid, angle, fill, line) {
    var d = 'M0 0 Q' + n(len * 0.45) + ' ' + n(-wid) + ' ' + n(len) + ' 0 Q' + n(len * 0.55) + ' ' + n(wid) + ' 0 0Z';
    return '<g transform="translate(' + n(x) + ' ' + n(y) + ') rotate(' + angle + ')">' +
      '<path d="' + d + '" fill="' + fill + '" stroke="' + line + '" stroke-width="1.3" stroke-linejoin="round"/>' +
      '<path d="M1.5 0 L' + n(len * 0.78) + ' 0" stroke="' + line + '" stroke-width="0.9" stroke-linecap="round" opacity=".55"/></g>';
  }

  function bolt(x, y, h, tilt, fill, line) {
    var pts = [[-2.4, 0], [2.2, 0], [1.2, -h * 0.42], [4.6, -h * 0.44], [-0.6, -h], [0.2, -h * 0.58], [-3.4, -h * 0.55]];
    var p = pts.map(function (q) { return n(x + q[0]) + ',' + n(y + q[1]); }).join(' ');
    return '<g transform="rotate(' + tilt + ' ' + n(x) + ' ' + n(y) + ')"><g class="zap"><polygon points="' + p +
      '" fill="' + fill + '" stroke="' + line + '" stroke-width="1.3" stroke-linejoin="round"/></g></g>';
  }

  function crystal(x, y, w, h, tilt, c) {
    var hw = w / 2;
    var outer = [[x - hw, y], [x - hw, y - h * 0.68], [x, y - h], [x + hw, y - h * 0.68], [x + hw, y]];
    var left = [[x - hw, y], [x - hw, y - h * 0.68], [x, y - h], [x, y]];
    function pts(a) { return a.map(function (q) { return n(q[0]) + ',' + n(q[1]); }).join(' '); }
    return '<g transform="rotate(' + tilt + ' ' + n(x) + ' ' + n(y) + ')">' +
      '<polygon points="' + pts(outer) + '" fill="' + c.accent + '" stroke="#2F8F86" stroke-width="1.3" stroke-linejoin="round"/>' +
      '<polygon points="' + pts(left) + '" fill="' + c.accent2 + '" opacity=".55"/>' +
      '<path d="M' + n(x) + ' ' + n(y - h) + ' L' + n(x) + ' ' + n(y) + '" stroke="#2F8F86" stroke-width=".8" opacity=".6"/></g>';
  }

  function bubble(x, y, r, c) {
    return '<g class="bub"><circle cx="' + n(x) + '" cy="' + n(y) + '" r="' + r + '" fill="' + c.accent2 + '" fill-opacity=".35" stroke="' + c.accent + '" stroke-width="1"/>' +
      '<circle cx="' + n(x - r * 0.35) + '" cy="' + n(y - r * 0.35) + '" r="' + n(r * 0.28) + '" fill="#fff"/></g>';
  }

  function spark(x, y, r, fill) {
    var d = 'M' + n(x) + ' ' + n(y - r) + ' Q' + n(x + r * 0.18) + ' ' + n(y - r * 0.18) + ' ' + n(x + r) + ' ' + n(y) +
      ' Q' + n(x + r * 0.18) + ' ' + n(y + r * 0.18) + ' ' + n(x) + ' ' + n(y + r) +
      ' Q' + n(x - r * 0.18) + ' ' + n(y + r * 0.18) + ' ' + n(x - r) + ' ' + n(y) +
      ' Q' + n(x - r * 0.18) + ' ' + n(y - r * 0.18) + ' ' + n(x) + ' ' + n(y - r) + 'Z';
    return '<path class="twinkle" d="' + d + '" fill="' + fill + '"/>';
  }

  function orb(x, y, r, c) {
    return '<g class="orb"><circle cx="' + n(x) + '" cy="' + n(y) + '" r="' + n(r * 2) + '" fill="' + c.accent + '" opacity=".18"/>' +
      flame(x, y + r, r * 2, r * 3.2, 0, c.accent, c.accent2, c.line) + '</g>';
  }

  // ---------- bodies ----------
  function bodyPath(shape, g, s) {
    var cx = g.cx, cy = g.cy, rx = g.rx, ry = g.ry, top = cy - ry, bot = cy + ry;
    if (shape === 'drop') {
      var tip = top - (6 + s * 2);
      return 'M' + n(cx) + ' ' + n(tip) +
        ' C' + n(cx + rx * 0.3) + ' ' + n(top + ry * 0.15) + ' ' + n(cx + rx) + ' ' + n(cy - ry * 0.45) + ' ' + n(cx + rx) + ' ' + n(cy) +
        ' A' + rx + ' ' + ry + ' 0 0 1 ' + n(cx - rx) + ' ' + n(cy) +
        ' C' + n(cx - rx) + ' ' + n(cy - ry * 0.45) + ' ' + n(cx - rx * 0.3) + ' ' + n(top + ry * 0.15) + ' ' + n(cx) + ' ' + n(tip) + 'Z';
    }
    if (shape === 'rock') {
      return 'M' + n(cx - rx * 0.62) + ' ' + n(top) +
        ' L' + n(cx + rx * 0.55) + ' ' + n(top + 1) +
        ' Q' + n(cx + rx) + ' ' + n(top + 2) + ' ' + n(cx + rx) + ' ' + n(top + ry * 0.55) +
        ' L' + n(cx + rx * 1.03) + ' ' + n(bot - ry * 0.4) +
        ' Q' + n(cx + rx) + ' ' + n(bot) + ' ' + n(cx + rx * 0.55) + ' ' + n(bot) +
        ' L' + n(cx - rx * 0.58) + ' ' + n(bot) +
        ' Q' + n(cx - rx * 1.02) + ' ' + n(bot) + ' ' + n(cx - rx * 1.03) + ' ' + n(bot - ry * 0.42) +
        ' L' + n(cx - rx) + ' ' + n(top + ry * 0.5) +
        ' Q' + n(cx - rx) + ' ' + n(top + 0.5) + ' ' + n(cx - rx * 0.62) + ' ' + n(top) + 'Z';
    }
    if (shape === 'ghost') {
      var B = bot - 1.5;
      return 'M' + n(cx - rx) + ' ' + n(cy) +
        ' A' + rx + ' ' + n(ry * 1.05) + ' 0 0 1 ' + n(cx + rx) + ' ' + n(cy) +
        ' L' + n(cx + rx) + ' ' + n(B) +
        ' Q' + n(cx + rx * 0.66) + ' ' + n(B + 5) + ' ' + n(cx + rx * 0.33) + ' ' + n(B) +
        ' Q' + n(cx) + ' ' + n(B - 4) + ' ' + n(cx - rx * 0.33) + ' ' + n(B) +
        ' Q' + n(cx - rx * 0.66) + ' ' + n(B + 5) + ' ' + n(cx - rx) + ' ' + n(B) + 'Z';
    }
    // blob: slightly pear-shaped ellipse
    return 'M' + n(cx) + ' ' + n(top) +
      ' C' + n(cx + rx * 0.62) + ' ' + n(top) + ' ' + n(cx + rx) + ' ' + n(cy - ry * 0.5) + ' ' + n(cx + rx) + ' ' + n(cy + ry * 0.1) +
      ' C' + n(cx + rx) + ' ' + n(bot - ry * 0.35) + ' ' + n(cx + rx * 0.6) + ' ' + n(bot) + ' ' + n(cx) + ' ' + n(bot) +
      ' C' + n(cx - rx * 0.6) + ' ' + n(bot) + ' ' + n(cx - rx) + ' ' + n(bot - ry * 0.35) + ' ' + n(cx - rx) + ' ' + n(cy + ry * 0.1) +
      ' C' + n(cx - rx) + ' ' + n(cy - ry * 0.5) + ' ' + n(cx - rx * 0.62) + ' ' + n(top) + ' ' + n(cx) + ' ' + n(top) + 'Z';
  }

  // ---------- family features ----------
  // Each painter pushes SVG into `behind` (drawn before the body) or `over` (after the face).
  var FEATURES = {
    ember: function (s, g, c, behind, over) {
      var cx = g.cx, top = g.cy - g.ry, L = '#B8321C';
      if (s === 1) {
        behind.push(flame(cx + 1, top + 4, 11, 15, 8, c.accent, c.accent2, L));
      } else if (s === 2) {
        behind.push(flame(g.cx + g.rx - 2, g.cy + g.ry * 0.45, 8, 13, 62, c.accent, c.accent2, L));
        behind.push(flame(cx - 7, top + 7, 8, 11, -24, c.accent, c.accent2, L));
        behind.push(flame(cx + 7.5, top + 7, 8, 11, 26, c.accent, c.accent2, L));
        behind.push(flame(cx + 0.5, top + 5, 12, 18, 5, c.accent, c.accent2, L));
      } else {
        behind.push(flame(g.cx + g.rx - 2, g.cy + g.ry * 0.4, 10, 17, 60, c.accent, c.accent2, L));
        var xs = [-13, -6.5, 0, 6.5, 13], hs = [10, 15, 20, 15, 10], ts = [-34, -16, 4, 18, 34];
        for (var i = 0; i < xs.length; i++) behind.push(flame(cx + xs[i], top + (i === 2 ? 5 : 7), i === 2 ? 12 : 9, hs[i], ts[i], c.accent, c.accent2, L));
        over.push(spark(cx - 21, top + 2, 2.4, c.accent2), spark(cx + 22, top + 6, 2, c.accent2));
      }
    },
    tide: function (s, g, c, behind, over) {
      var cx = g.cx, cy = g.cy, rx = g.rx, ry = g.ry, top = cy - ry, tip = top - (6 + s * 2);
      if (s >= 2) {
        var fw = s === 2 ? 8 : 11;
        [-1, 1].forEach(function (k) {
          var bx = cx + k * rx * 0.82;
          behind.push('<path d="M' + n(bx) + ' ' + n(cy - ry * 0.35) + ' Q' + n(cx + k * (rx + fw)) + ' ' + n(cy - ry * 0.75) +
            ' ' + n(cx + k * (rx + fw * 0.9)) + ' ' + n(cy - ry * 0.05) + ' Q' + n(cx + k * (rx + 2)) + ' ' + n(cy + ry * 0.02) +
            ' ' + n(bx) + ' ' + n(cy + ry * 0.12) + 'Z" fill="' + c.light + '" stroke="' + c.line + '" stroke-width="1.4" stroke-linejoin="round"/>');
        });
        over.push('<path d="M' + n(cx - rx * 0.42) + ' ' + n(cy + ry * 0.55) + ' q' + n(rx * 0.14) + ' -2.6 ' + n(rx * 0.28) + ' 0 t' +
          n(rx * 0.28) + ' 0 t' + n(rx * 0.28) + ' 0" fill="none" stroke="' + c.dark + '" stroke-width="1.3" stroke-linecap="round" opacity=".7"/>');
      }
      if (s === 3) {
        behind.push('<path d="M' + n(cx + rx - 4) + ' ' + n(cy + ry * 0.55) + ' Q' + n(cx + rx + 8) + ' ' + n(cy + ry * 0.2) + ' ' + n(cx + rx + 11) + ' ' + n(cy - ry * 0.15) +
          ' Q' + n(cx + rx + 6) + ' ' + n(cy + ry * 0.45) + ' ' + n(cx + rx + 12) + ' ' + n(cy + ry * 0.75) +
          ' Q' + n(cx + rx + 4) + ' ' + n(cy + ry * 0.8) + ' ' + n(cx + rx - 4) + ' ' + n(cy + ry * 0.75) + 'Z" fill="' + c.light + '" stroke="' + c.line + '" stroke-width="1.4" stroke-linejoin="round"/>');
        behind.push('<path d="M' + n(cx - 3) + ' ' + n(tip + 6) + ' C' + n(cx + 3) + ' ' + n(tip - 7) + ' ' + n(cx + 16) + ' ' + n(tip - 5) + ' ' + n(cx + 13) + ' ' + n(tip + 6) +
          ' C' + n(cx + 11) + ' ' + n(tip + 1) + ' ' + n(cx + 6) + ' ' + n(tip + 1) + ' ' + n(cx + 5) + ' ' + n(tip + 8) + 'Z" fill="' + c.accent2 + '" stroke="' + c.line + '" stroke-width="1.4" stroke-linejoin="round"/>');
      }
      over.push(bubble(cx + rx + 3, top - 1, s === 1 ? 2.6 : 3, c));
      if (s >= 2) over.push(bubble(cx - rx - 2, top + 4, 2.2, c));
      if (s === 3) over.push(bubble(cx + rx + 9, top - 9, 1.8, c));
    },
    sprout: function (s, g, c, behind, over) {
      var cx = g.cx, cy = g.cy, rx = g.rx, ry = g.ry, top = cy - ry, line = c.line, leafFill = c.accent;
      var stemTop = top - (s === 1 ? 5 : s === 2 ? 8 : 9);
      behind.push('<path d="M' + n(cx) + ' ' + n(top + 3) + ' Q' + n(cx + 1.5) + ' ' + n((top + stemTop) / 2) + ' ' + n(cx) + ' ' + n(stemTop) +
        '" stroke="' + line + '" stroke-width="2.2" fill="none" stroke-linecap="round"/>');
      if (s === 1) {
        behind.push(leaf(cx, stemTop + 1, 10, 4.5, -152, leafFill, line), leaf(cx, stemTop + 1, 10, 4.5, -28, leafFill, line));
      } else if (s === 2) {
        behind.push(leaf(cx, stemTop + 3, 13, 5.5, -158, leafFill, line), leaf(cx, stemTop + 3, 13, 5.5, -22, leafFill, line));
        behind.push(leaf(cx - 9, top + 5, 9, 4, -128, c.dark, line));
        behind.push('<ellipse cx="' + n(cx) + '" cy="' + n(stemTop - 2.5) + '" rx="3.2" ry="4.2" fill="' + c.accent2 + '" stroke="#C9567C" stroke-width="1.2"/>');
      } else {
        behind.push(leaf(g.cx + rx - 3, cy + ry * 0.5, 15, 5.5, -18, c.dark, line));
        behind.push(leaf(cx - 6, top + 5, 15, 6, -160, leafFill, line), leaf(cx + 6, top + 5, 15, 6, -20, leafFill, line));
        var petals = '';
        for (var i = 0; i < 5; i++) {
          var a = (i * 72 - 90) * Math.PI / 180;
          petals += '<ellipse cx="' + n(cx + Math.cos(a) * 4.6) + '" cy="' + n(stemTop - 3 + Math.sin(a) * 4.6) + '" rx="3.4" ry="4.6" transform="rotate(' +
            (i * 72) + ' ' + n(cx + Math.cos(a) * 4.6) + ' ' + n(stemTop - 3 + Math.sin(a) * 4.6) + ')" fill="' + c.accent2 + '" stroke="#C9567C" stroke-width="1.1"/>';
        }
        behind.push(petals + '<circle cx="' + n(cx) + '" cy="' + n(stemTop - 3) + '" r="2.9" fill="#FFD166" stroke="#D99A00" stroke-width="1"/>');
        over.push(spark(cx + rx + 4, top + 2, 2, '#FFD166'));
      }
    },
    volt: function (s, g, c, behind, over) {
      var cx = g.cx, cy = g.cy, rx = g.rx, ry = g.ry, top = cy - ry;
      if (s === 1) {
        behind.push(bolt(cx + 2, top + 4, 17, 12, c.accent, c.accent2));
      } else {
        // zigzag tail
        var tx = cx + rx - 3, ty = cy + ry * 0.35, k = s === 2 ? 1 : 1.3;
        var tail = [[0, 0], [7 * k, -3 * k], [4 * k, -7 * k], [12 * k, -11 * k], [8 * k, -15 * k], [14 * k, -17 * k], [5 * k, -12 * k], [8 * k, -9 * k], [1, -5 * k]];
        behind.push('<polygon class="zap" points="' + tail.map(function (q) { return n(tx + q[0]) + ',' + n(ty + q[1]); }).join(' ') +
          '" fill="' + c.accent + '" stroke="' + c.accent2 + '" stroke-width="1.3" stroke-linejoin="round"/>');
        if (s === 2) {
          behind.push(bolt(cx - 6, top + 5, 15, -20, c.accent, c.accent2), bolt(cx + 6, top + 5, 15, 20, c.accent, c.accent2));
        } else {
          behind.push(bolt(cx - 10, top + 6, 14, -28, c.accent, c.accent2), bolt(cx + 10, top + 6, 14, 28, c.accent, c.accent2), bolt(cx + 0.5, top + 5, 20, 2, c.accent, c.accent2));
          over.push(spark(cx - rx - 3, top + 6, 2.6, c.accent), spark(cx + rx + 5, top - 2, 2.2, c.accent), spark(cx - rx + 2, top - 6, 1.8, c.accent));
        }
      }
    },
    stone: function (s, g, c, behind, over) {
      var cx = g.cx, cy = g.cy, rx = g.rx, ry = g.ry, top = cy - ry;
      var crack = '<path d="M' + n(cx - rx * 0.75) + ' ' + n(cy + ry * 0.05) + ' l3 2 l-1 3 l3 1.5" fill="none" stroke="' + c.line + '" stroke-width="1" stroke-linecap="round" opacity=".55"/>';
      if (s === 1) {
        behind.push(crystal(cx + 4, top + 3, 7, 12, 15, c));
        over.push(crack);
      } else if (s === 2) {
        behind.push(crystal(cx - 7, top + 3.5, 6, 10, -20, c), crystal(cx + 8, top + 4, 5, 9, 26, c), crystal(cx + 1, top + 2.5, 7, 15, 4, c));
        over.push(crack, '<path d="M' + n(cx + rx * 0.55) + ' ' + n(cy + ry * 0.35) + ' l-2.5 2 l1 2.5" fill="none" stroke="' + c.line + '" stroke-width="1" stroke-linecap="round" opacity=".5"/>');
      } else {
        behind.push(crystal(cx - rx * 0.98, cy - ry * 0.1, 6, 11, -62, c), crystal(cx + rx * 0.98, cy - ry * 0.1, 6, 11, 62, c));
        var xs = [-12, -6, 0, 6, 12], hs = [9, 13, 18, 13, 9], ts = [-30, -14, 2, 15, 30];
        for (var i = 0; i < 5; i++) behind.push(crystal(cx + xs[i], top + (i === 2 ? 2.5 : 3.5), i === 2 ? 7 : 5.5, hs[i], ts[i], c));
        over.push(crack, '<path d="M' + n(cx) + ' ' + n(cy - ry * 0.72) + ' l2.6 2.6 l-2.6 2.6 l-2.6 -2.6z" fill="' + c.accent + '" stroke="#2F8F86" stroke-width="1"/>');
      }
    },
    shade: function (s, g, c, behind, over) {
      var cx = g.cx, cy = g.cy, rx = g.rx, ry = g.ry, top = cy - ry * 1.05;
      if (s === 3) behind.unshift('<ellipse class="aura" cx="' + cx + '" cy="' + n(cy + 2) + '" rx="' + n(rx + 9) + '" ry="' + n(ry + 9) + '" fill="' + c.accent + '" opacity=".16"/>');
      if (s === 1) {
        behind.push(flame(cx + 1, top + 4, 8, 10, 14, c.body, c.light, c.line));
      } else {
        [-1, 1].forEach(function (k) {
          var hx = cx + k * 8;
          behind.push('<path d="M' + n(hx - 3.5) + ' ' + n(top + 5) + ' Q' + n(hx + k * 1.5) + ' ' + n(top - 7) + ' ' + n(hx + k * 4) + ' ' + n(top - 4) +
            ' Q' + n(hx + k * 2) + ' ' + n(top + 1) + ' ' + n(hx + 3.5) + ' ' + n(top + 5) + 'Z" fill="' + c.dark + '" stroke="' + c.line + '" stroke-width="1.3" stroke-linejoin="round"/>');
        });
        if (s === 3) {
          behind.push(flame(cx - 4, top + 4, 7, 11, -16, c.accent, c.accent2, c.line), flame(cx + 4.5, top + 4, 7, 11, 16, c.accent, c.accent2, c.line), flame(cx + 0.5, top + 3, 9, 16, 2, c.accent, c.accent2, c.line));
        }
        over.push(orb(cx + rx + 6, cy - ry * 0.55, 2.6, c));
        if (s === 3) over.push(orb(cx - rx - 6, cy - ry * 0.2, 2.2, c));
      }
    }
  };

  // ---------- face ----------
  function eyes(g, s, mood) {
    var r = 2.6 + s * 0.35, ey = g.cy - g.ry * 0.12, dx = g.rx * 0.36, out = '';
    [-1, 1].forEach(function (k) {
      var ex = g.cx + k * dx;
      if (mood === 'happy') {
        out += '<path d="M' + n(ex - r) + ' ' + n(ey + r * 0.35) + ' Q' + n(ex) + ' ' + n(ey - r * 1.1) + ' ' + n(ex + r) + ' ' + n(ey + r * 0.35) +
          '" stroke="' + INK + '" stroke-width="2" fill="none" stroke-linecap="round"/>';
      } else if (mood === 'sleep') {
        out += '<path d="M' + n(ex - r) + ' ' + n(ey) + ' Q' + n(ex) + ' ' + n(ey + r * 0.8) + ' ' + n(ex + r) + ' ' + n(ey) +
          '" stroke="' + INK + '" stroke-width="1.8" fill="none" stroke-linecap="round"/>';
      } else {
        var rr = mood === 'alert' ? r * 1.15 : r, oy = mood === 'think' ? -0.8 : 0, ox = mood === 'think' ? 0.6 : 0;
        out += '<ellipse cx="' + n(ex) + '" cy="' + n(ey) + '" rx="' + n(rr * 0.84) + '" ry="' + n(rr) + '" fill="' + INK + '"/>' +
          '<circle cx="' + n(ex + rr * 0.28 + ox) + '" cy="' + n(ey - rr * 0.38 + oy) + '" r="' + n(rr * 0.36) + '" fill="#fff"/>' +
          '<circle cx="' + n(ex - rr * 0.3 + ox) + '" cy="' + n(ey + rr * 0.38 + oy) + '" r="' + n(rr * 0.15) + '" fill="#fff" opacity=".8"/>';
      }
    });
    var cls = (mood === 'happy' || mood === 'sleep') ? 'eyes' : 'eyes blink';
    return '<g class="' + cls + '">' + out + '</g>';
  }

  function face(g, s, mood, c) {
    var ey = g.cy - g.ry * 0.12, dx = g.rx * 0.36, r = 2.6 + s * 0.35, my = g.cy + g.ry * 0.2, cx = g.cx, m;
    var blush = '<ellipse cx="' + n(cx - dx - r * 0.5) + '" cy="' + n(ey + r * 1.55) + '" rx="2.8" ry="1.6" fill="#FF7FA3" opacity=".38"/>' +
      '<ellipse cx="' + n(cx + dx + r * 0.5) + '" cy="' + n(ey + r * 1.55) + '" rx="2.8" ry="1.6" fill="#FF7FA3" opacity=".38"/>';
    if (mood === 'happy') m = '<path d="M' + n(cx - 3.4) + ' ' + n(my - 0.5) + ' Q' + n(cx) + ' ' + n(my + 4.6) + ' ' + n(cx + 3.4) + ' ' + n(my - 0.5) + 'Z" fill="#7A2E3A" stroke="#3B2230" stroke-width="1" stroke-linejoin="round"/>';
    else if (mood === 'sleep') m = '<path d="M' + n(cx - 1.6) + ' ' + n(my + 0.6) + ' L' + n(cx + 1.6) + ' ' + n(my + 0.6) + '" stroke="#3B2230" stroke-width="1.5" stroke-linecap="round"/>';
    else if (mood === 'alert') m = '<ellipse cx="' + n(cx) + '" cy="' + n(my + 0.8) + '" rx="1.7" ry="2.1" fill="#7A2E3A" stroke="#3B2230" stroke-width="1"/>';
    else m = '<path d="M' + n(cx - 2.6) + ' ' + n(my) + ' Q' + n(cx) + ' ' + n(my + 2.8) + ' ' + n(cx + 2.6) + ' ' + n(my) + '" stroke="#3B2230" stroke-width="1.6" fill="none" stroke-linecap="round"/>';
    var sweat = mood === 'alert'
      ? '<path d="M' + n(cx + g.rx * 0.72) + ' ' + n(ey - r * 2.2) + ' q2 3 0 4.4 q-2 -1.4 0 -4.4z" fill="#9ADCFF" stroke="#3C8DBC" stroke-width=".9"/>'
      : '';
    return '<g class="face">' + eyes(g, s, mood) + blush + m + sweat + '</g>';
  }

  // ---------- main render ----------
  function render(familyId, stage, opts) {
    opts = opts || {};
    var f = family(familyId), s = clampStage(stage), c = f.colors, mood = opts.mood || 'normal';
    var base = GEO[s - 1];
    var g = { cx: base.cx, cy: base.cy, rx: base.rx, ry: base.ry };
    var uid = opts.uid || ('am' + (++counter) + Math.random().toString(36).slice(2, 6));
    var behind = [], over = [];
    FEATURES[f.id](s, g, c, behind, over);
    var bot = g.cy + g.ry, feet = '', arms = '';
    if (f.shape !== 'ghost') {
      [-1, 1].forEach(function (k) {
        feet += '<ellipse class="' + (k < 0 ? 'foot-l' : 'foot-r') + '" cx="' + n(g.cx + k * g.rx * 0.45) + '" cy="' + n(bot - 0.5) +
          '" rx="' + n(g.rx * 0.27) + '" ry="3.8" fill="' + c.dark + '" stroke="' + c.line + '" stroke-width="1.6"/>';
      });
    }
    if (s >= 2) {
      [-1, 1].forEach(function (k) {
        var ax = g.cx + k * g.rx * 0.93, ay = g.cy + g.ry * 0.18;
        arms += '<g class="' + (k < 0 ? 'arm-l' : 'arm-r') + '"><ellipse cx="' + n(ax) + '" cy="' + n(ay) + '" rx="4.2" ry="6.2" transform="rotate(' + (k * -28) + ' ' + n(ax) + ' ' + n(ay) +
          ')" fill="' + c.body + '" stroke="' + c.line + '" stroke-width="1.6"/></g>';
      });
    }
    var belly = '<ellipse cx="' + n(g.cx) + '" cy="' + n(g.cy + g.ry * 0.4) + '" rx="' + n(g.rx * 0.58) + '" ry="' + n(g.ry * 0.44) + '" fill="' + c.belly + '" opacity=".92"/>';
    var shine = '<ellipse cx="' + n(g.cx - g.rx * 0.45) + '" cy="' + n(g.cy - g.ry * 0.55) + '" rx="' + n(g.rx * 0.18) + '" ry="' + n(g.ry * 0.1) +
      '" transform="rotate(-30 ' + n(g.cx - g.rx * 0.45) + ' ' + n(g.cy - g.ry * 0.55) + ')" fill="#fff" opacity=".45"/>';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" class="am-creature fam-' + f.id + ' st-' + s + '" role="img" aria-label="' + f.stages[s - 1] + '">' +
      '<defs><radialGradient id="' + uid + 'g" cx="36%" cy="30%" r="78%"><stop offset="0" stop-color="' + c.light + '"/><stop offset=".55" stop-color="' + c.body +
      '"/><stop offset="1" stop-color="' + c.dark + '"/></radialGradient></defs>' +
      '<g class="behind">' + behind.join('') + '</g>' + feet +
      '<g class="torso"><path d="' + bodyPath(f.shape, g, s) + '" fill="url(#' + uid + 'g)" stroke="' + c.line + '" stroke-width="2" stroke-linejoin="round"/>' +
      belly + shine + arms + '</g>' + face(g, s, mood, c) + '<g class="over">' + over.join('') + '</g></svg>';
  }

  var api = {
    FAMILIES: FAMILIES,
    TYPE_COLORS: TYPE_COLORS,
    XP_STAGES: XP_STAGES,
    family: family,
    stageName: stageName,
    stageForXp: stageForXp,
    nextStageXp: nextStageXp,
    render: render
  };
  root.AgentMonCreatures = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
