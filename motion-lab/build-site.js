#!/usr/bin/env node
/* Assembles the deployable site into motion-lab/_site.
 *
 * Run:  SITE_URL=https://your-project.web.app node motion-lab/build-site.js
 *
 * SITE_URL is the final public origin. When it is set, the build writes the
 * absolute tags search engines need — canonical, og:url, og:image — plus
 * robots.txt and sitemap.xml. When it is not set those tags are omitted
 * entirely, because a canonical pointing at the wrong origin is worse for
 * ranking than no canonical at all.
 */
const fs = require('fs');
const path = require('path');

const root = __dirname;
const out = path.join(root, '_site');
const siteUrl = (process.env.SITE_URL || '').trim().replace(/\/+$/, '');

// An origin, optionally with a base path — this app is published under a
// subdirectory when it shares a host with Video Lab.
if (siteUrl && !/^https?:\/\/[^/]+(\/[\w.-]+)*$/.test(siteUrl)) {
  throw new Error('SITE_URL must be an origin like https://motion-lab.web.app, optionally with a path like https://example.github.io/motion-lab');
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const dir of ['css', 'js']) {
  fs.cpSync(path.join(root, dir), path.join(out, dir), { recursive: true });
}
const ogImage = path.join(root, 'og-image.png');
const hasOgImage = fs.existsSync(ogImage);
if (hasOgImage) fs.copyFileSync(ogImage, path.join(out, 'og-image.png'));

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Motion Lab',
  applicationCategory: 'MultimediaApplication',
  operatingSystem: 'Any browser',
  description:
    'Turns a written script into a finished animated video from thirty seconds to three hours, in eight ' +
    'animation styles built around the retention mechanics YouTube rewards, and generates the chapters, ' +
    'titles and description to match. Runs entirely in the browser.',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  featureList: [
    'Script to animated video, 30 seconds to 3 hours',
    'Eight animation styles built around retention mechanics',
    'Automatic hook window, pattern interrupts, open loop and loop-back ending',
    'Preflight that measures text fit, contrast, caption speed and safe areas',
    'Frame-exact WebCodecs rendering with segmented output for long-form',
    'Generated music bed, YouTube chapters, titles, description and tags',
    'Shot list and cast block for handing the plan to a generative model'
  ]
};
if (siteUrl) structuredData.url = siteUrl + '/';

const head = [];
if (siteUrl) {
  head.push('<link rel="canonical" href="' + siteUrl + '/">');
  head.push('<meta property="og:url" content="' + siteUrl + '/">');
  if (hasOgImage) {
    head.push('<meta property="og:image" content="' + siteUrl + '/og-image.png">');
    head.push('<meta property="og:image:width" content="1200">');
    head.push('<meta property="og:image:height" content="630">');
    head.push('<meta name="twitter:image" content="' + siteUrl + '/og-image.png">');
  }
}
head.push('<script type="application/ld+json">' + JSON.stringify(structuredData) + '</script>');

html = html.replace('</head>', head.join('\n') + '\n</head>');
if (!html.includes('application/ld+json')) throw new Error('Failed to inject head tags');
fs.writeFileSync(path.join(out, 'index.html'), html);

// robots.txt belongs at the host root, so it is only written when this app is
// the whole site. Under a subdirectory the parent site owns it.
const atRoot = !siteUrl || /^https?:\/\/[^/]+$/.test(siteUrl);
if (atRoot) {
  const robots = ['User-agent: *', 'Allow: /'];
  if (siteUrl) robots.push('', 'Sitemap: ' + siteUrl + '/sitemap.xml');
  fs.writeFileSync(path.join(out, 'robots.txt'), robots.join('\n') + '\n');
}

if (siteUrl) {
  const today = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(out, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    '  <url>\n' +
    '    <loc>' + siteUrl + '/</loc>\n' +
    '    <lastmod>' + today + '</lastmod>\n' +
    '    <changefreq>monthly</changefreq>\n' +
    '    <priority>1.0</priority>\n' +
    '  </url>\n' +
    '</urlset>\n');
}

console.log('built ' + path.relative(process.cwd(), out) +
  (siteUrl ? ' for ' + siteUrl : ' without SITE_URL (no canonical or sitemap)'));
