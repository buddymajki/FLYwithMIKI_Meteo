// scrape.js — extracts the MeteoSwiss regional text forecast via headless Chromium.
// The page is an Angular SPA with shadow DOM, so a plain fetch/curl sees no text;
// a real browser engine is required. Runs in GitHub Actions, writes meteoswiss.json.
const { chromium } = require('playwright');
const fs = require('fs');

const URL = 'https://www.meteoschweiz.admin.ch/#tab=forecast-map';
const REGIONS = [
  'Wetterprognose für die Deutschschweiz, Nord- und Mittelbünden',
  'Wetterprognose für die Westschweiz und das Wallis',
  'Wetterprognose für die Alpensüdseite und das Engadin'
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ locale: 'de-CH' });
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(4000); // let Angular finish rendering

  const fullText = await page.evaluate(() => {
    function walk(node, out) {
      if (node.shadowRoot) walk(node.shadowRoot, out);
      for (const child of node.children || []) walk(child, out);
      if (node.nodeType === 1 && node.children.length === 0 &&
          node.tagName !== 'STYLE' && node.tagName !== 'SCRIPT') {
        const t = node.innerText || node.textContent;
        if (t && t.trim()) out.push(t.trim());
      }
    }
    const out = [];
    walk(document.body, out);
    return out.join('\n');
  });

  const result = { regions: {}, fetchedAtUTC: new Date().toISOString() };
  for (let i = 0; i < REGIONS.length; i++) {
    const start = fullText.indexOf(REGIONS[i]);
    if (start === -1) continue;
    const after = REGIONS.slice(i + 1).map(r => fullText.indexOf(r)).filter(x => x > start);
    const end = after.length ? Math.min(...after) : start + 2600;
    result.regions[REGIONS[i]] = fullText.slice(start, end).trim();
  }

  if (Object.keys(result.regions).length === 0) {
    console.error('No region text found — page structure may have changed.');
    process.exit(1);
  }
  fs.writeFileSync('meteoswiss.json', JSON.stringify(result, null, 2));
  console.log('Wrote meteoswiss.json with', Object.keys(result.regions).length, 'regions at', result.fetchedAtUTC);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
