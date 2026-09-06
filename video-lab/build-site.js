#!/usr/bin/env node
/* Assembles the deployable site into video-lab/_site.
 *
 * Run:  SITE_URL=https://your-project.web.app node video-lab/build-site.js
 *
 * SITE_URL is the final public origin. When it is set, the build writes the
 * absolute tags that search engines need — canonical, og:url, og:image — plus
 * robots.txt and sitemap.xml. When it is not set those tags are omitted
 * entirely, because a canonical pointing at the wrong origin is worse for
 * ranking than no canonical at all.
 */
const fs = require('fs');
const path = require('path');

const root = __dirname;
const out = path.join(root, '_site');
const siteUrl = (process.env.SITE_URL || '').trim().replace(/\/+$/, '');

if (siteUrl && !/^https?:\/\/[^/]+$/.test(siteUrl)) {
  throw new Error('SITE_URL must be a bare origin like https://video-lab.web.app');
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// Copy the site's own assets. Build scripts, the README and the artifact
// bundle are not part of the deployed site.
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
  name: 'Video Lab',
  applicationCategory: 'MultimediaApplication',
  operatingSystem: 'Any browser',
  description:
    'Scores a video out of 100 on hook, pacing, retention, image quality, colour, audio and format fit, ' +
    'explains what is costing views, and exports a fixed cut. Runs entirely in the browser.',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  featureList: [
    'Frame-by-frame video analysis',
    'Cut and dead-zone detection',
    'Audio loudness and silence analysis',
    'Ranked, measured recommendations',
    'Reframing, colour correction and trimming',
    'Export edited video, cover image and report'
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

// robots.txt: crawlable either way, but only advertise a sitemap that exists.
const robots = ['User-agent: *', 'Allow: /'];
if (siteUrl) robots.push('', 'Sitemap: ' + siteUrl + '/sitemap.xml');
fs.writeFileSync(path.join(out, 'robots.txt'), robots.join('\n') + '\n');

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
