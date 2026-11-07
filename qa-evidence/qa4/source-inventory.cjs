// Conservative source-text scan, not a TypeScript parser or a runtime inventory.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = 'web/src';
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name, 'en')).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return /^(?:__tests__|node_modules)$/.test(e.name) ? [] : walk(p);
    return e.isFile() && /\.(?:ts|tsx|js|jsx|json)$/.test(e.name) && !/\.(?:test|spec)\.[^.]+$/.test(e.name) ? [p] : [];
  });
}
const points = s => [...new Set(Array.from(s).map(c=>c.codePointAt(0)).filter(c=>c>=0x900 && c<=0x97f))].sort((a,b)=>a-b).map(c=>'U+'+c.toString(16).toUpperCase().padStart(4,'0'));
const files=walk(root); const results=files.map(file=>{const text=fs.readFileSync(file,'utf8'); return {file,sha256:crypto.createHash('sha256').update(text).digest('hex'),devanagariCodepoints:points(text)}}).filter(x=>x.devanagariCodepoints.length);
const union=[...new Set(results.flatMap(r=>r.devanagariCodepoints))].sort();
const out={method:'Literal U+0900–097F in all non-test TS, TSX, JS, JSX and JSON text under web/src, including comments, source strings and both legal howLongBody branches. Conservative source scan, not parsed translations or actual runtime output; unicode escapes, generated content, Intl and user input are excluded.',scannedFileCount:files.length,files:results,union};
fs.writeFileSync('qa-evidence/qa4/source-inventory.json',JSON.stringify(out,null,2)+'\n'); console.log('Scanned',files.length,'files; with Devanagari',results.length,'union',union.length); for(const r of results)console.log(r.file,r.devanagariCodepoints.length);
