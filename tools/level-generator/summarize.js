const fs=require('fs');
const rows=['levels.jsonl'].filter(f=>fs.existsSync(f)).flatMap(f=>fs.readFileSync(f,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)).sort((a,b)=>a.k-b.k);
const ok=rows.filter(r=>!r.fail),R=ok.map(r=>r.report);
const st=(f)=>{const v=R.map(f).filter(x=>x!=null);v.sort((a,b)=>a-b);const m=v.reduce((a,b)=>a+b,0)/v.length;return {min:v[0],median:v[v.length>>1],max:v[v.length-1],mean:+m.toFixed(3)}};
const sum=(f)=>R.reduce((a,r)=>a+f(r),0);
const out={levels:ok.length,failed:rows.length-ok.length,
 legality:{countsOK:R.every(r=>r.countsOK),coverOK:R.every(r=>r.coverOK),pathOK:R.every(r=>r.pathOK),solverPathReplayOK:R.filter(r=>r.solver.cap6.found).every(r=>r.solver.cap6.pathReplayOK)},
 total:st(r=>r.total),layers:st(r=>r.layers),stack:st(r=>r.stackL),
 pathPeak:st(r=>r.pathPeak),pathMeanOcc:st(r=>r.pathMeanOcc),mid5plus:st(r=>r.pathMidOcc5plus),mid0to2:st(r=>r.pathMidOcc0to2),
 tripleSpanMax:st(r=>r.tripleSpanMax),longHeldTriples:st(r=>r.longHeldTriples),thirdDepthMean:st(r=>r.thirdTileDepthMean),unlockDepthMax:st(r=>r.unlockDepthMax),
 solverCap6Found:R.filter(r=>r.solver.cap6.found).length,solverCap6Nodes:st(r=>r.solver.cap6.found?r.solver.cap6.nodes:null),
 cap3found:R.filter(r=>r.solver.cap3.found).length,cap4found:R.filter(r=>r.solver.cap4.found).length,cap4exhausted:R.filter(r=>r.solver.cap4.exhausted).length,
 cap5found:R.filter(r=>r.solver.cap5.found).length,cap5exhausted:R.filter(r=>r.solver.cap5.exhausted).length,cap5Nodes:st(r=>r.solver.cap5.found?r.solver.cap5.nodes:null),
 strategies:Object.fromEntries(Object.keys(R[0].strategies).map(k=>{const w=sum(r=>r.strategies[k].wins),n=sum(r=>r.strategies[k].runs);return [k,{wins:w,runs:n,passRate:+(w/n).toFixed(4),avgRemovedFrac:+(sum(r=>r.strategies[k].avgRemoved/r.total)/R.length).toFixed(3)}]})),
 traps:{avgOptions:st(r=>r.traps.avgOptions),fatalOptionRate:st(r=>r.traps.fatalOptionRate),highRiskPoints:st(r=>r.traps.highRiskPoints),
   baitMoves:sum(r=>r.traps.baitMoves??0),fatalBaitMoves:sum(r=>r.traps.fatalBaitMoves??0),tripleMoves:sum(r=>r.traps.tripleMoves??0),fatalTripleMoves:sum(r=>r.traps.fatalTripleMoves??0),unknown:sum(r=>r.traps.unknownOptions)},
 genSeconds:st(r=>null)};
out.genSeconds=(()=>{const v=ok.map(r=>r.ms/1000);return {mean:+(v.reduce((a,b)=>a+b,0)/v.length).toFixed(1),max:Math.max(...v).toFixed(1)}})();
console.log(JSON.stringify(out,null,1));
fs.writeFileSync('summary.json',JSON.stringify(out,null,1));
