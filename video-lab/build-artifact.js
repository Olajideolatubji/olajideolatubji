#!/usr/bin/env node
/* Inlines the site into one self-contained HTML file, because an Artifact
   serves a single file and cannot fetch sibling CSS or JS.
   Run: node video-lab/build-artifact.js  ->  video-lab/dist/video-lab.html */
const fs = require('fs');
const path = require('path');

const root = __dirname;
const SCRIPTS = ['util', 'analyze', 'audio', 'score', 'editor', 'export', 'main'];

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'app.css'), 'utf8');

// Fixed rather than taken from index.html: the page's <title> is written for
// Google, but the gallery wants the product name on its own.
const title = 'Video Lab';
const body = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/) || [, ''])[1];
if (!body.trim()) throw new Error('Could not find the body of index.html');

const inlined = SCRIPTS.map(name => {
  const src = fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8');
  // A literal </script> inside the source would close the tag early.
  if (/<\/script/i.test(src)) throw new Error(name + '.js contains a closing script tag');
  return '<script>\n' + src.trimEnd() + '\n</script>';
}).join('\n');

// Swap the block of external <script src> tags for the inlined sources. The
// replacement MUST be a function: as a string, `$$` in the source would be
// interpreted as an escape and silently collapse to a single `$`.
const stripped = body.replace(/(?:[ \t]*<script src="[^"]+"><\/script>\s*)+/g, () => '\n' + inlined + '\n');
if (stripped.includes('<script src=')) throw new Error('An external script tag survived inlining');

// Canary for the escape bug above, which is invisible in the rendered page.
const dollarPairs = (src) => (src.match(/\$\$/g) || []).length;
if (dollarPairs(stripped) !== dollarPairs(inlined)) {
  throw new Error('Inlined sources were mangled: $$ count changed during replacement');
}

const out = [
  '<title>' + title + '</title>',
  '<style>',
  css.trimEnd(),
  '</style>',
  stripped.trim(),
  ''
].join('\n');

const dir = path.join(root, 'dist');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, 'video-lab.html');
fs.writeFileSync(file, out);
console.log('wrote ' + path.relative(process.cwd(), file) + ' (' + (out.length / 1024).toFixed(1) + ' KB)');
