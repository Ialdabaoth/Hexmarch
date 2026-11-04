// Render a page-per-sheet HTML file to a vector PDF (11 x 8.5 in), optionally screenshotting pages.
// usage: node pdf.js <absolute html path> [none | comma-separated 0-based page indexes]
const {chromium} = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({viewport: {width: 1056, height: 816}});
  const f = process.argv[2];
  // The exploration sheets are a large page; a slow CI runner needs more than the default 30 s to load it.
  await p.goto('file://' + f, {waitUntil: 'load', timeout: 300000});
  await p.waitForTimeout(800);
  await p.pdf({path: f.replace('.html', '.pdf'), width: '11in', height: '8.5in', printBackground: true});
  if (process.argv[3] !== 'none') {
    const pg = await p.$$('svg.pg');
    for (const n of (process.argv[3] || '0').split(',')) {
      await pg[+n].screenshot({path: f.replace('.html', '-p' + (+n + 1) + '.png')});
    }
  }
  await b.close();
})();
