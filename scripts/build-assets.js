#!/usr/bin/env node
// Dev-only: renders creature PNGs (used for desktop notifications) and the extension icons.
// Needs `sharp` (npm i -D sharp). The generated PNGs are committed, so users never run this.
'use strict';
const path = require('path');
const fs = require('fs');
let sharp;
try { sharp = require('sharp'); } catch (_) { sharp = require(process.env.SHARP_PATH || 'sharp'); }
const C = require('../extension/creatures.js');
const OUT = path.join(__dirname, '..', 'extension', 'img');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  for (const f of C.FAMILIES) {
    for (let s = 1; s <= 3; s++) {
      const svg = C.render(f.id, s, { uid: 'x' }).replace('<svg ', '<svg width="160" height="160" ');
      await sharp(Buffer.from(svg)).png().toFile(path.join(OUT, `${f.id}-${s}.png`));
    }
  }
  const pet = C.render('volt', 1, { uid: 'i' }).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  const icon = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 80 80">
    <rect x="2" y="2" width="76" height="76" rx="20" fill="#221d3d"/>
    <g transform="translate(-2 -6) scale(1.05)">${pet}</g></svg>`;
  for (const size of [16, 32, 48, 128]) await sharp(Buffer.from(icon(size))).png().toFile(path.join(OUT, `icon${size}.png`));
  console.log('assets written to', OUT);
})();
