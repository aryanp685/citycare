import assert from 'node:assert/strict';
import pg from 'pg';
// This verification creates synthetic grievances; refuse anything except the explicitly
// designated isolated local test database and local server. Never use a shared database.
const url = new URL(process.env.DATABASE_URL ?? '');
if (process.env.CITYCARE_SYNTHETIC_TEST !== '1' || url.hostname !== '127.0.0.1' || url.port !== '5432' || url.pathname !== '/citycare_e2e') throw new Error('Requires the isolated synthetic citycare_e2e database');
const base='http://127.0.0.1:3101'; let passed=0;
function check(ok,desc){assert.ok(ok,desc);passed++;console.log('PASS '+desc)}
class Session {constructor(){this.cookie=''} async request(method,path,body){const r=await fetch(base+path,{method,headers:{origin:base,...(this.cookie?{cookie:this.cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}); for(const c of r.headers.getSetCookie()) if(c.startsWith('cc_session=')) this.cookie=c.split(';')[0]; let data={};try{data=await r.json()}catch{}; return {status:r.status,data}}}
const anon=new Session(), a=new Session(), b=new Session(), doc=new Session(), admin=new Session();
for(const [s,email] of [[a,'ramesh@demo.in'],[b,'anita@demo.in'],[doc,'dr.kulkarni@demo.in'],[admin,'admin@demo.in']]) {const r=await s.request('POST','/api/auth/login',{email,password:'city1234'});check(r.status===200,'synthetic '+(s===a?'patient A':s===b?'patient B':s===doc?'doctor':'admin')+' login succeeds')}
const body={category:'ACCESS',subject:'Synthetic grievance authorization',body:'Synthetic request for access assistance and review.'};
check((await anon.request('GET','/api/grievances')).status===401,'anonymous own-list denied');
check((await anon.request('POST','/api/grievances',body)).status===401,'anonymous submission denied');
check((await anon.request('GET','/api/admin/grievances')).status===401,'anonymous admin queue denied');
const created=await a.request('POST','/api/grievances',body);check(created.status===201 && !!created.data.id,'patient creates grievance'); const id=created.data.id;
check((await a.request('GET','/api/grievances')).data.grievances.some(g=>g.id===id),'patient sees own grievance');
check(!(await b.request('GET','/api/grievances')).data.grievances.some(g=>g.id===id),'other patient cannot see grievance');
check(!(await doc.request('GET','/api/grievances')).data.grievances.some(g=>g.id===id),'doctor cannot see patient grievance in own list');
for(const [s,label] of [[a,'patient'],[doc,'doctor']]){check((await s.request('GET','/api/admin/grievances')).status===403,label+' denied admin queue');check((await s.request('PATCH',`/api/admin/grievances/${id}`,{status:'RESOLVED',resolution:'Unauthorized synthetic update'})).status===403,label+' denied admin update')}
check((await anon.request('PATCH',`/api/admin/grievances/${id}`,{status:'RESOLVED',resolution:'Unauthorized synthetic update'})).status===401,'anonymous denied admin update');
let r=await a.request('GET','/api/grievances');check(r.data.grievances.find(g=>g.id===id)?.status==='OPEN','unauthorized updates left grievance OPEN');
r=await admin.request('GET','/api/admin/grievances');check(r.status===200 && r.data.grievances.some(g=>g.id===id),'admin can read queue');
r=await admin.request('PATCH',`/api/admin/grievances/${id}`,{status:'RESOLVED',resolution:'Synthetic review complete'});check(r.status===200,'admin can resolve grievance');
r=await a.request('GET','/api/grievances');check(r.data.grievances.some(g=>g.id===id && g.status==='RESOLVED' && g.resolution==='Synthetic review complete'),'patient sees intact resolution');
const doctorCase=await doc.request('POST','/api/grievances',{...body,subject:'Synthetic doctor grievance'});check(doctorCase.status===201,'doctor can file own grievance');
check((await doc.request('GET','/api/grievances')).data.grievances.some(g=>g.id===doctorCase.data.id),'doctor sees own grievance');
check(!(await a.request('GET','/api/grievances')).data.grievances.some(g=>g.id===doctorCase.data.id),'patient cannot see doctor grievance');
const c=new pg.Client({connectionString:process.env.DATABASE_URL}); await c.connect();
const audit=await c.query('SELECT action, count(*)::int n FROM "AuditLog" WHERE "entityType" = $1 AND "entityId" = $2 GROUP BY action',['Grievance',id]);
check(audit.rows.some(x=>x.action==='GRIEVANCE_OPENED'&&x.n===1)&&audit.rows.some(x=>x.action==='GRIEVANCE_UPDATED'&&x.n===1),'exactly one open and one authorized update audit event');
const row=await c.query('SELECT status, resolution, "resolvedAt", "handledBy" FROM "Grievance" WHERE id=$1',[id]);check(row.rows.length===1&&row.rows[0].status==='RESOLVED'&&row.rows[0].resolution==='Synthetic review complete'&&!!row.rows[0].resolvedAt&&!!row.rows[0].handledBy,'database grievance state and review metadata intact');
const ledger=await c.query('SELECT count(*)::int n FROM ledger_verify()');check(ledger.rows[0].n===0,'ledger verifies after grievance workflow');await c.end();
console.log(`${passed} passed, 0 failed, 0 skipped`);
