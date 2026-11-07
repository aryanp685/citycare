// Requires QA_TOOLS containing playwright-core and @sparticuz/chromium; synthetic DB/app only.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const tools=process.env.QA_TOOLS;
if (!tools || process.env.CITYCARE_SYNTHETIC_TEST !== '1') throw Error('QA_TOOLS and synthetic-only flag required');
const require=createRequire(`${tools}/package.json`);
const { chromium:playwright }=require('playwright-core');
const chromium=(await import(pathToFileURL(`${tools}/node_modules/@sparticuz/chromium/build/index.js`).href)).default;
const browser=await playwright.launch({executablePath:await chromium.executablePath(), args:chromium.args.filter(a => a !== "--single-process"),headless:true});
const base='http://localhost:3000', dir='qa-evidence/doctor-workspace';
async function session(email){let c=await browser.newContext({viewport:{width:1280,height:900}});let p=await c.newPage();let r=await p.request.post(base+'/api/auth/login',{data:{email,password:'city1234'}});assert.equal(r.status(),200,`login ${email}`);return {c,p}}
const doctor=await session('dr.sheikh@demo.in'), patient=await session('ramesh@demo.in');
const widths=[320,375,390,414,768,1024,1280,1440], results=[];
async function capture(page,route,label){for(let w of widths){await page.setViewportSize({width:w,height:900});await page.goto(base+route,{waitUntil:'networkidle'});await page.screenshot({path:`${dir}/${label}-${w}.png`,fullPage:true});let sizes=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));results.push({route,width:w,...sizes,overflow:sizes.scroll>sizes.client});}}
await capture(doctor.p,'/doctor','doctor-dashboard');
await capture(doctor.p,'/doctor/patients','doctor-patients');
await capture(doctor.p,'/doctor/profile','doctor-profile');
await capture(doctor.p,'/doctor/activity','doctor-activity');
// Request via the connected synthetic patient card.
await doctor.p.setViewportSize({width:1280,height:900});await doctor.p.goto(base+'/doctor/patients',{waitUntil:'networkidle'});
let card=doctor.p.locator('.card').filter({has:doctor.p.getByRole('heading',{name:'Ramesh Shelar'})});
if (await card.getByRole('button',{name:'Request access'}).count()) { await card.getByLabel('Requested scope').selectOption('SUMMARY_ONLY');await card.getByLabel('Purpose').selectOption('SECOND_OPINION');await card.getByRole('button',{name:'Request access'}).click();await card.getByText('Request sent to the patient').waitFor(); }
await capture(patient.p,'/patient/access','patient-access');
await patient.p.setViewportSize({width:1280,height:900});await patient.p.goto(base+'/patient/access',{waitUntil:'networkidle'});
let request=patient.p.locator('div.rounded-xl.border').filter({has:patient.p.getByRole('heading',{name:'Dr. Farhan Sheikh'})}).filter({hasText:'REQUESTED'}).first();
await request.getByRole('button',{name:'Review & approve'}).click();await request.getByRole('button',{name:'Confirm approve'}).click();
await patient.p.getByText('Access granted — the doctor now sees only what you chose.').waitFor();
await doctor.p.goto(base+'/doctor/patients',{waitUntil:'networkidle'});let card2=doctor.p.locator('.card').filter({has:doctor.p.getByRole('heading',{name:'Ramesh Shelar'})});await card2.getByText('Active',{exact:true}).waitFor();
await card2.getByRole('link',{name:'Open workspace'}).click();await doctor.p.getByRole('button',{name:'Write consultation note + prescription'}).waitFor();await doctor.p.getByRole('button',{name:'Write consultation note + prescription'}).click();await doctor.p.getByText('Chief complaint').waitFor();
await doctor.p.screenshot({path:`${dir}/doctor-consultation-1280.png`,fullPage:true});
await patient.p.goto(base+'/patient/access',{waitUntil:'networkidle'});let active=patient.p.locator('div.rounded-xl.border').filter({has:patient.p.getByRole('heading',{name:'Dr. Farhan Sheikh'})}).filter({hasText:'APPROVED'}).first();await active.getByRole('button',{name:'Revoke now'}).click();await patient.p.getByText('Revoked. New requests are checked again; a request already in progress may finish.').waitFor();
await doctor.p.reload({waitUntil:'networkidle'});await doctor.p.getByText('Access refused',{exact:true}).waitFor();
fs.writeFileSync(`${dir}/browser-results.json`,JSON.stringify({browser:'Chromium 153, synthetic local DB',widths,results,workflow:['request','patient approval','open scoped record','open existing encounter form','revoke','doctor reload denied']},null,2));
console.log(JSON.stringify(results));await browser.close();
