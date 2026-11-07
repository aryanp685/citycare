import assert from 'node:assert/strict';
import fs from 'node:fs';
import pg from '/home/user/citycare-qa/node_modules/pg/lib/index.js';
import { chromium } from '/home/user/citycare-qa/node_modules/playwright-core/index.mjs';
import chrome from '/home/user/citycare-qa/node_modules/@sparticuz/chromium/build/index.js';
const db=new pg.Client({host:'127.0.0.1',port:55439,user:'citycare_test',password:'local-synthetic-only',database:'citycare_synthetic'});await db.connect();const identity=(await db.query("SELECT current_setting('data_directory') AS dir, current_database() AS name")).rows[0];assert.deepEqual(identity,{dir:'/home/user/citycare-qa/disposable-db',name:'citycare_synthetic'});await db.end();
const browser=await chromium.launch({executablePath:await chrome.executablePath(),args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'],headless:true});const base='http://127.0.0.1:3010',dir='/home/user/citycare/qa-evidence/responsive-font-2026-11-07';const results=[];
async function login(email){const c=await browser.newContext({viewport:{width:1280,height:900}}),p=await c.newPage();await p.goto(base+'/login');await p.getByLabel('Email').fill(email);await p.getByLabel('Password').fill('city1234');await p.getByRole('button',{name:'Sign in',exact:true}).click();await p.waitForURL(/\/(admin|patient)$/);return p;}
function record(name,pass,details={}){results.push({name,pass,...details});console.log(pass?'PASS':'FAIL',name,JSON.stringify(details));}
try {
 const admin=await login('admin@demo.in');
 for(const width of [320,375,768,1280]){await admin.setViewportSize({width,height:900});await admin.goto(base+'/admin',{waitUntil:'networkidle'});await admin.evaluate(()=>document.fonts.ready);const sizes=await admin.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));record(`admin ${width} viewport overflow`,sizes.client===sizes.scroll,{sizes});
   const area=admin.getByRole('region',{name:'Registrations awaiting verification'});const dimensions=await area.evaluate(el=>({scroll:el.scrollWidth,client:el.clientWidth,tabindex:el.getAttribute('tabindex')}));record(`admin ${width} table region`,dimensions.tabindex==='0'&&(width>=1280||dimensions.scroll>dimensions.client),{dimensions});
   if(width===320){await area.focus();await admin.keyboard.press('ArrowRight');await admin.waitForTimeout(400);const left=await area.evaluate(el=>el.scrollLeft);record('admin table keyboard scroll',left>0,{scrollLeft:left});}
   if(width===320||width===375||width===1280)await admin.screenshot({path:`${dir}/admin-${width}.png`,fullPage:true});
 }
 const patient=await login('ramesh@demo.in');
 for(const [lang,label] of [['hi','खोजें'],['mr','शोधा']]){await patient.setViewportSize({width:375,height:900});await patient.goto(base+'/patient/doctors',{waitUntil:'networkidle'});await patient.locator('#citycare-language').selectOption(lang);await patient.getByRole('button',{name:label,exact:true}).waitFor();await patient.evaluate(()=>document.fonts.ready);
   const status=await patient.evaluate(()=>({faces:[...document.fonts].filter(f=>f.family==='CityCare Devanagari').map(f=>({family:f.family,status:f.status})),check:document.fonts.check('400 16px "CityCare Devanagari"','मराठी हिन्दी'),resource:performance.getEntriesByType('resource').filter(r=>r.name.includes('NotoSansDevanagari')).map(r=>r.name),width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
   record(`${lang} local font loaded`,status.check&&status.faces.some(f=>f.status==='loaded')&&status.resource.length>0,status);record(`${lang} mobile overflow`,status.width===status.scroll,{width:status.width,scroll:status.scroll});await patient.screenshot({path:`${dir}/discovery-${lang}-375.png`,fullPage:true});
 }
 fs.writeFileSync(`${dir}/results.json`,JSON.stringify({browser:await browser.version(),database:'isolated synthetic PostgreSQL 18.6',flags:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'],results},null,2));
 if(results.some(r=>!r.pass))process.exitCode=1;
}finally{await browser.close()}
