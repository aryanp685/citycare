// Only against the dedicated synthetic loopback cluster created for this QA run.
import assert from 'node:assert/strict';
import pg from 'pg';
if (process.env.CITYCARE_SYNTHETIC_TEST !== '1' || process.env.DATABASE_URL !== 'postgresql://citycare@127.0.0.1:55432/postgres') throw Error('Dedicated synthetic DB required');
const base = 'http://127.0.0.1:3000';
const db = new pg.Client({connectionString:process.env.DATABASE_URL}); await db.connect();
const getId=async(sql,...args)=>(await db.query(sql,args)).rows[0].id;
const doctor=await getId('SELECT d.id FROM "Doctor" d JOIN "User" u ON u.id=d."userId" WHERE u.email=$1','dr.sheikh@demo.in');
const patient=await getId('SELECT p.id FROM "Patient" p JOIN "User" u ON u.id=p."userId" WHERE u.email=$1','ramesh@demo.in');
const other=await getId('SELECT p.id FROM "Patient" p JOIN "User" u ON u.id=p."userId" WHERE u.email=$1','vikas@demo.in');
await db.query(`INSERT INTO "Appointment" (id,"patientId","doctorId","scheduledAt",status,"updatedAt",reason) VALUES (gen_random_uuid(),$1,$2,now()+interval '10 days','PENDING',now(),'Synthetic test appointment')`, [patient,doctor]);
async function login(email){const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password:'city1234'})}); assert.equal(r.status,200,`${email} login`); return r.headers.get('set-cookie').split(';')[0]}
const doc=await login('dr.sheikh@demo.in'), pat=await login('ramesh@demo.in'), wrong=await login('vikas@demo.in'), doc2=await login('dr.kulkarni@demo.in'), unverified=await login('dr.pending@demo.in');
let n=0;
async function req(cookie,path,method='GET',body){let r=await fetch(base+path,{method,headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}); let text=await r.text(); let json;try{json=JSON.parse(text)}catch{json={html:text}};return {status:r.status,data:json}}
function eq(actual,expected,what){assert.equal(actual,expected,`${what}: ${actual} != ${expected}`); console.log('PASS',what); n++}
const path=`/api/doctor/patients/${patient}/request-access`;
eq((await req(null,path,'POST',{scope:'SUMMARY_ONLY',purpose:'TREATMENT'})).status,401,'anonymous denied');
eq((await req(pat,path,'POST',{scope:'SUMMARY_ONLY',purpose:'TREATMENT'})).status,403,'patient role denied');
eq((await req(unverified,path,'POST',{scope:'SUMMARY_ONLY',purpose:'TREATMENT'})).status,403,'unverified doctor denied');
eq((await req(doc2,path,'POST',{scope:'SUMMARY_ONLY',purpose:'TREATMENT'})).status,404,'other doctor without appointment denied');
eq((await req(doc,`/api/doctor/patients/${other}/request-access`,'POST',{scope:'SUMMARY_ONLY',purpose:'TREATMENT'})).status,404,'unconnected patient denied');
eq((await req(doc,path,'POST',{scope:'BOGUS',purpose:'TREATMENT'})).status,400,'invalid scope rejected');
eq((await req(doc,`/api/doctor/patients/${patient}/record`)).status,403,'record denied before consent');
const parallel=await Promise.all([req(doc,path,'POST',{scope:'SUMMARY_ONLY',purpose:'SECOND_OPINION'}),req(doc,path,'POST',{scope:'SUMMARY_ONLY',purpose:'SECOND_OPINION'})]);
eq(parallel.map(x=>x.status).sort().join(','),'201,409','duplicate concurrent invitations');
let id=parallel.find(x=>x.status===201).data.consentId;assert.ok(id);
let pending=await req(pat,'/api/patient/consents'); const p=pending.data.consents.find(c=>c.id===id); assert.equal(p.purpose,'SECOND_OPINION'); assert.equal(p.scope,'SUMMARY_ONLY');eq(p.status,'REQUESTED','request details recorded');
eq((await req(wrong,`/api/patient/consents?id=${id}`,'PATCH',{decision:'DENY'})).status,409,'another patient cannot deny');
eq((await req(pat,`/api/patient/consents?id=${id}`,'PATCH',{decision:'DENY'})).status,200,'patient denies request');
eq((await db.query('SELECT status FROM "Consent" WHERE id=$1',[id])).rows[0].status,'DENIED','denial stored distinctly');
eq((await req(pat,'/api/patient/consents','POST',{doctorId:doctor,consentId:id,scope:'FULL_RECORD',expiryDays:7})).status,409,'stale request cannot be approved');
const again=await req(doc,path,'POST',{scope:'SUMMARY_ONLY',purpose:'SECOND_OPINION'});eq(again.status,201,'new request after denial'); id=again.data.consentId;
eq((await req(pat,'/api/patient/consents','POST',{doctorId:doctor,consentId:id,scope:'SUMMARY_ONLY',expiryDays:7})).status,201,'patient grants selected scope');
let record=await req(doc,`/api/doctor/patients/${patient}/record`);eq(record.status,200,'approved doctor reads');eq(record.data.scope,'SUMMARY_ONLY','scope applied');
eq((await req(doc2,`/api/doctor/patients/${patient}/record`)).status,403,'other doctor cannot use consent');
eq((await req(pat,`/api/patient/consents?id=${id}`,'PATCH',{decision:'REVOKE'})).status,200,'patient revokes');
eq((await req(doc,`/api/doctor/patients/${patient}/record`)).status,403,'new read denied after revocation');
const page=await req(doc,`/doctor/patients/${other}`); assert.ok([200,404].includes(page.status)); assert.ok(!page.data.html.includes('Vikas Jadhav')); assert.ok(!page.data.html.includes('PatientWorkspace')); eq(true,true,'unrelated patient page hides identifiers (streamed not-found may be HTTP 200)');
const expiredReq=await req(doc,path,'POST',{scope:'LAST_N_ENCOUNTERS',purpose:'TREATMENT'});eq(expiredReq.status,201,'request created for expiry test');
await db.query(`UPDATE "Consent" SET "expiresAt"=now()-interval '1 minute' WHERE id=$1`,[expiredReq.data.consentId]);
eq((await req(pat,'/api/patient/consents','POST',{doctorId:doctor,consentId:expiredReq.data.consentId,scope:'SUMMARY_ONLY',expiryDays:7})).status,409,'expired request cannot be approved');
eq((await req(doc,`/api/doctor/patients/${patient}/record`)).status,403,'expired request grants no access');
const audit=await db.query(`SELECT action FROM "AuditLog" WHERE "consentId"=$1`,[id]); assert.ok(audit.rows.some(r=>r.action==='REQUEST_CONSENT'));assert.ok(audit.rows.some(r=>r.action==='GRANT_CONSENT'));assert.ok(audit.rows.some(r=>r.action==='REVOKE_CONSENT'));eq((await db.query('SELECT count(*)::int AS n FROM ledger_verify()')).rows[0].n,0,'ledger verifies');
console.log(`${n} checks passed`);await db.end();
