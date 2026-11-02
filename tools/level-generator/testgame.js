// 在真实游戏页面里按预设路径逐张点击，验证：每一步都可点、不会触发失败、最终通关
const fs=require('fs');const {chromium}=require('playwright');
const rows=fs.readFileSync(require('path').join(__dirname,'levels.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse).filter(r=>!r.fail).sort((a,b)=>a.k-b.k);

(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:400,height:820}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('**/api/**',r=>r.fulfill({json:{cleared:0,rank:1}}));
await p.goto('file://'+require('path').join(__dirname,'../../index.html'));await p.waitForTimeout(300);
const res=[];
for(let idx=0;idx<rows.length;idx++){
  const r=await p.evaluate(async ({idx,seq})=>{
    const st=window.__st||(window.__st=window.setTimeout);window.setTimeout=(f,ms)=>st(f,0);
    window.dailyIndex=()=>idx;startLevel(1);
    const sleep=()=>new Promise(r=>st(r,0));let peak=0;
    for(let s=0;s<seq.length;s++){
      while(G.busy)await sleep();
      const t=G.tiles[seq[s]];
      if(!isFree(t))return {ok:false,why:'step '+s+' 不可点'};
      t.el.click();peak=Math.max(peak,G.slot.length);
      if(G.over)return {ok:false,why:'step '+s+' 触发失败'};
    }
    while(G.busy)await sleep();await sleep();
    const won=G.tiles.every(t=>t.state==='gone')&&!$('veil').hidden&&$('card').textContent.includes('今日通关');
    return {ok:won,n:G.tiles.length,peakBeforeClear:peak,why:won?'':'未显示通关'};
  },{idx,seq:rows[idx].seq});
  res.push({k:rows[idx].k,...r});
}
console.log(JSON.stringify({levels:res.length,allOK:res.every(r=>r.ok),fails:res.filter(r=>!r.ok),pageErrors:errs}));
await b.close()})();
