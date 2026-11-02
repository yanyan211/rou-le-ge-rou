// 把 levels.jsonl 里的关卡池写进 ../../index.html
const fs=require('fs'),path=require('path');
const rows=fs.readFileSync(path.join(__dirname,'levels.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse).filter(r=>!r.fail).sort((a,b)=>a.k-b.k);
const file=path.join(__dirname,'../../index.html');
let s=fs.readFileSync(file,'utf8');
s=s.replace(/\/\*POOL_START\*\/[\s\S]*?\/\*POOL_END\*\//,'/*POOL_START*/'+JSON.stringify(rows.map(r=>r.code))+'/*POOL_END*/');
fs.writeFileSync(file,s);console.log('写入',rows.length,'关');
