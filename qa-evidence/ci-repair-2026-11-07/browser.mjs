import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '/home/user/citycare-qa/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({executablePath:'/tmp/chromium',args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'],headless:true});
const results=[];
try {
  for (const [policy, port] of [['demo',3011],['pilot',3012]]) {
    const page=await browser.newPage({viewport:{width:375,height:900}});
    await page.goto(`http://localhost:${port}/legal/terms`,{waitUntil:'networkidle'});
    const text=await page.locator('main').innerText();
    if (policy === 'demo') assert.ok(text.includes('accounts you create are erased after 7 days'), 'demo erasure notice missing');
    else assert.ok(!text.includes('accounts you create are erased after 7 days'), 'pilot must not claim demo auto-erasure');
    const size=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
    assert.equal(size.width,size.scroll,JSON.stringify(size));
    await page.screenshot({path:`/home/user/citycare/qa-evidence/ci-repair-2026-11-07/terms-${policy}-375.png`,fullPage:true});
    results.push({policy,copyMatches:true,noHorizontalOverflow:true});await page.close();
  }
  fs.writeFileSync('/home/user/citycare/qa-evidence/ci-repair-2026-11-07/browser-results.json',JSON.stringify({browser:await browser.version(),results},null,2));
}finally {await browser.close();}
