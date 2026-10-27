#!/usr/bin/env node
// Builds a single-file demo page (scripts inlined) from demo/index.html.
//   demo/standalone.html  -> open it straight from disk in any browser
//   dist/demo-artifact.html -> same content without the document wrapper (for hosting as an artifact)
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(ROOT, 'demo', 'index.html'), 'utf8');
const inline = (rel) => '<script>\n' + fs.readFileSync(path.join(ROOT, 'demo', rel), 'utf8').replace(/<\/script/gi, '<\\/script') + '\n</script>';
html = html
  .replace('<script src="../extension/creatures.js"></script>', () => inline('../extension/creatures.js'))
  .replace('<script src="../extension/ui.js"></script>', () => inline('../extension/ui.js'))
  .replace('<script src="sim.js"></script>', () => inline('sim.js'));

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist', 'demo-artifact.html'), html);
const doc = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
  '<style>[hidden]{display:none!important}</style>\n</head>\n<body>\n' + html + '\n</body>\n</html>\n';
fs.writeFileSync(path.join(ROOT, 'demo', 'standalone.html'), doc);
console.log('built demo/standalone.html and dist/demo-artifact.html');
