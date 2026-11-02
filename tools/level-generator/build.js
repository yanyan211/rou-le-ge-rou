// 生成一关地狱关：批量候选 → 快速评估筛选 → 爬山优化（针对简单解法）→ 完整评估 → 验收
'use strict';
const C=require('./core');

function makeCandidate(r){
  const layers=10+Math.floor(r()*3);                 // 10~12 层
  const stack=15+Math.floor(r()*6);                  // 每摞 15~20
  const total=3*Math.floor((195+r()*46)/3);          // 195~240，3 的倍数
  const p={layers,board:total-2*stack,stack,half:r()<.75?3:4};
  const tiles=C.genLayout(p,r);const cover=C.buildCover(tiles);
  const seq=C.genSequence(tiles,cover,r,0.5+r()*0.2);
  let types=null;for(let g=0;g<80&&!types;g++)types=C.assignOnSeq(tiles.length,seq,r,{hi:6,keepOld:2+r()*2});
  if(!types)return null;
  return {p,tiles,seq,types};
}

// 快速难度分（越大越难）：用固定随机种子，保证不同候选之间可比
function quick(c,seedTag){
  const e=new C.Engine(c.tiles,c.types);const n=c.tiles.length;
  const run=(f,N,tag)=>{let w=0,rm=0;for(let s=0;s<N;s++){const r=C.play(e,c.tiles,f,C.rngFrom(seedTag+tag+s));w+=r.win;rm+=r.removed/n}return [w,rm/N]};
  const [w1,r1]=run(C.STRATS.triple,6,'t'),[w2,r2]=run(C.STRATS.greedy,8,'g');
  const [w3,r3]=run(C.lookaheadStrat(2),6,'l'),[w4,r4]=run(C.lookaheadFairStrat(2),3,'f');
  const d6=C.solve(e,{cap:6,budget:20000}),d4=C.solve(e,{cap:4,budget:20000});
  let score=-(r1+r2)*2-(w1+w2)*3-r3*10-w3*3-r4*4-w4*6;
  score+=d6.found?Math.log10(d6.nodes)*0.5:2.5;
  if(d4.found)score-=6;
  return {score,simpleWins:w1+w2,look2:w3,fair2:w4,dfs6:d6.found?d6.nodes:null,cap4:d4.found};
}

// 变异：① 交换两张牌的图案 ② 从路径中段开始重新分配后半段图案；都必须保持预设通关路径合法
function mutate(c,r){
  const n=c.tiles.length;
  if(r()<0.5){
    const s0=Math.floor(n*(0.15+r()*0.75));
    for(let g=0;g<20;g++){const t=C.assignOnSeq(n,c.seq,r,{hi:6,keepOld:1+r()*3},s0,c.types);if(t&&C.simulateSeq(t,c.seq))return {...c,types:t}}
  }
  for(let tries=0;tries<200;tries++){
    const a=Math.floor(r()*n),b=Math.floor(r()*n);
    if(c.types[a]===c.types[b])continue;
    const t=Int8Array.from(c.types);[t[a],t[b]]=[t[b],t[a]];
    if(C.simulateSeq(t,c.seq))return {...c,types:t};
  }
  return null;
}

// ---------- 完整评估 ----------
function fullEval(c,tag){
  const T=c.tiles,n=T.length,e=new C.Engine(T,c.types),R={};
  // 1) 合法性
  const cnt=new Array(C.NTYPES).fill(0);for(const t of c.types)cnt[t]++;
  R.total=n;R.board=T.filter(t=>t.zone==='board').length;R.stackL=T.filter(t=>t.zone==='L').length;R.stackR=T.filter(t=>t.zone==='R').length;
  R.layers=Math.max(...T.filter(t=>t.zone==='board').map(t=>t.z))+1;
  R.typeCounts=cnt;R.countsOK=n%3===0&&cnt.every(x=>x%3===0)&&cnt.filter(x=>x>0).length===C.NTYPES;
  // 遮挡：交叉检查 —— 用暴力几何重新算每张牌的初始可点状态，与引擎一致
  let coverOK=true;for(let i=0;i<n;i++){const blocked=T.some((o,j)=>j!==i&&o.z>T[i].z&&C.overlaps(o,T[i]));if(blocked!==(e.cov[i]>0))coverOK=false}
  R.coverOK=coverOK;
  // 2) 预设通关路径按真实规则回放
  e.reset();let ok=true,peak=0;const curve=[];
  for(const i of c.seq){if(!e.free.includes(i)){ok=false;break}const o=e.take(i);if(o>=C.SLOT){ok=false;break}curve.push(o);peak=Math.max(peak,o)}
  R.pathOK=ok&&e.left===0;e.reset();
  R.pathPeak=peak;
  const mid=curve.slice(Math.floor(n*0.3),Math.floor(n*0.9));
  R.pathMidOcc5plus=+(mid.filter(x=>x>=5).length/mid.length).toFixed(3);
  R.pathMidOcc0to2=+(mid.filter(x=>x<=2).length/mid.length).toFixed(3);
  R.pathMeanOcc=+(curve.reduce((a,b)=>a+b,0)/n).toFixed(2);
  // 三消跨度：同一组三消从第一张到第三张隔了几步；关键第三张的解锁深度
  {const slot=new Map();const spans=[],depths=[];c.seq.forEach((i,s)=>{const t=c.types[i];const a=slot.get(t)||[];a.push(s);if(a.length===3){spans.push(s-a[0]);depths.push(e.depth[i]);slot.delete(t)}else slot.set(t,a)});
   spans.sort((a,b)=>a-b);R.tripleSpanMedian=spans[spans.length>>1];R.tripleSpanMax=spans[spans.length-1];R.longHeldTriples=spans.filter(x=>x>=20).length;
   R.thirdTileDepthMean=+(depths.reduce((a,b)=>a+b,0)/depths.length).toFixed(2);R.thirdTileDepthMax=Math.max(...depths)}
  R.unlockDepthMax=Math.max(...e.depth);
  // 3) 完整求解器（独立于预设路径），以及寻找低槽位“捷径”解
  const t0=Date.now();
  const s6=C.solve(e,{cap:6,budget:3e6});R.solver={cap6:{found:s6.found,exhausted:s6.exhausted,nodes:s6.nodes,states:s6.states}};
  if(s6.found){ // 用真实规则复核求解器给出的路径
    e.reset();let ok2=true;for(const i of s6.path){if(!e.free.includes(i)||e.take(i)>=C.SLOT){ok2=false;break}}R.solver.cap6.pathReplayOK=ok2&&e.left===0;e.reset();
  }
  for(const cap of [3,4,5]){const s=C.solve(e,{cap,budget:cap===5?3e6:2e6});R.solver['cap'+cap]={found:s.found,exhausted:s.exhausted,nodes:s.nodes,states:s.states};if(s.found&&cap<=4)R._shortcut=s.path}
  // 换几种随机搜索顺序再找一次 ≤4 的捷径，避免只因排序启发式而错过
  R.solver.cap4rand=[];for(let k=0;k<3;k++){const s=C.solve(e,{cap:4,budget:1e6,orderMode:'rand',rng:C.rngFrom(tag+'c4r'+k)});R.solver.cap4rand.push({found:s.found,exhausted:s.exhausted,nodes:s.nodes});if(s.found){R.solver.cap4.found=true;R._shortcut=R._shortcut||s.path}}
  R.solverMs=Date.now()-t0;
  // 最低峰值槽位的上下界
  let lo=null;for(const cap of [3,4,5]){const s=R.solver['cap'+cap];if(s.found){lo=lo??cap;}}
  R.minPeak=R.solver.cap3.found?'≤3':R.solver.cap4.found?'4':R.solver.cap5.found?(R.solver.cap4.exhausted?'5（已证明不存在≤4的解）':'5（≤4在预算内未找到）'):(R.solver.cap5.exhausted?'6（已证明不存在≤5的解）':'≥5?（≤5在预算内未找到）');
  // 4) 模拟玩家通过率
  R.strategies={};
  const runS=(name,f,N)=>{let w=0,rem=0,pk=0;for(let s=0;s<N;s++){const r=C.play(e,T,f,C.rngFrom(tag+name+s));w+=r.win;rem+=r.removed;pk=Math.max(pk,r.peak)}R.strategies[name]={runs:N,wins:w,passRate:+(w/N).toFixed(3),avgRemoved:+(rem/N).toFixed(1)}};
  runS('random',C.STRATS.random,200);runS('triple',C.STRATS.triple,200);runS('top',C.STRATS.top,200);
  runS('unlock',C.STRATS.unlock,200);runS('greedy',C.STRATS.greedy,200);
  runS('fair2',C.lookaheadFairStrat(2),40);runS('fair3',C.lookaheadFairStrat(3),10);runS('look2',C.lookaheadStrat(2),40);runS('look3',C.lookaheadStrat(3),10);
  // 5) 陷阱分析：沿预设路径采样决策点，逐个检查每个可点选项之后是否还有解
  {e.reset();const pts=[];for(let k=1;k<=24;k++)pts.push(Math.floor(n*k/26));let step=0,dec=0,risky=0,bait=0,baitFatal=0,tri=0,triFatal=0,fatalTot=0,optTot=0,unk=0;
   for(const i of c.seq){
     if(pts.includes(step)){
       const mv=e.free.slice();let fatal=0,known=0;
       for(const m of mv){
         const isTriple=e.slot[e.type[m]]===2;
         const tm=e.type[m];let fc=0;for(const j of e.free)if(e.type[j]===tm)fc++;
         const attractive=!isTriple&&(e.slot[tm]===1||(e.slot[tm]===0&&fc>=3));
         const o=e.take(m);let st;
         if(o>=C.SLOT)st='dead';else{
           // 在当前局面上继续用求解器，看是否还能通关（预设路径的下一步除外，必然有解）
           if(m===i)st='win';else{
             // 保存状态：复制引擎太贵，直接在当前引擎上做子搜索
             st=subSolve(e,20000);
           }
         }
         e.undo(m);
         if(st==='dead'||st==='fatal'){fatal++;known++;if(isTriple)triFatal++;if(attractive)baitFatal++}else if(st==='win')known++;else unk++;
         if(isTriple)tri++;if(attractive)bait++;
       }
       optTot+=mv.length;fatalTot+=fatal;dec++;
       if(known&&fatal/mv.length>=0.5)risky++;
     }
     e.take(i);step++;
   }
   e.reset();
   R.traps={samplePoints:dec,avgOptions:+(optTot/dec).toFixed(1),fatalOptionRate:+(fatalTot/optTot).toFixed(3),unknownOptions:unk,highRiskPoints:risky,tripleMoves:tri,fatalTripleMoves:triFatal,baitMoves:bait,fatalBaitMoves:baitFatal};
  }
  return R;
}
// 在当前局面上做一次有界子搜索：win / fatal（穷尽证明无解）/ unknown
function subSolve(e,budget){
  const seen=new Set();let nodes=0,out=false;const stack=[];
  const rec=()=>{
    if(e.left===0)return true;if(++nodes>budget){out=true;return false}
    const k=e.key();if(seen.has(k))return false;
    const mv=[];for(const i of e.free){const o=e.occAfter(i);if(o<C.SLOT)mv.push(i)}
    const sc=i=>(e.slot[e.type[i]]===2?1000:e.slot[e.type[i]]===1?100:0)+e.unlocks(i)*3;mv.sort((a,b)=>sc(b)-sc(a));
    for(const i of mv){e.take(i);stack.push(i);if(rec())return true;stack.pop();e.undo(i);if(out)return false}
    seen.add(k);return false;
  };
  const ok=rec();
  while(stack.length)e.undo(stack.pop()); // 还原
  return ok?'win':out?'unknown':'fatal';
}

// 只找捷径：≤4 槽位的解（智能顺序 + 3 种随机顺序）
function findShortcut(c,tag,full){
  const e=new C.Engine(c.tiles,c.types);const B=full?1:0.25;
  for(const cap of [3,4]){const s=C.solve(e,{cap,budget:2e6*B});if(s.found)return s.path}
  for(let k=0;k<3;k++){const s=C.solve(e,{cap:4,budget:1e6*B,orderMode:'rand',rng:C.rngFrom(tag+'c4r'+k)});if(s.found)return s.path}
  return null;
}
function peakOn(types,path){const slot=new Int8Array(C.NTYPES);let occ=0,pk=0;for(const i of path){const t=types[i];if(slot[t]===2){slot[t]=0;occ-=2}else{slot[t]++;occ++;if(occ>=C.SLOT)return 99}if(occ>pk)pk=occ}return pk}
// 针对捷径修牌：交换图案，让捷径路径必须超过 4 张槽位，同时预设路径仍然合法
function repair(c,path,r,tag){
  const n=c.tiles.length;let best=null;
  for(let tries=0,found=0;tries<600&&found<6;tries++){
    // 优先改捷径前半段里的牌
    const a=path[Math.floor(r()*r()*path.length)],b=Math.floor(r()*n);
    if(c.types[a]===c.types[b])continue;
    const t=Int8Array.from(c.types);[t[a],t[b]]=[t[b],t[a]];
    if(!C.simulateSeq(t,c.seq)||peakOn(t,path)<=4)continue;
    found++;const m={...c,types:t};m.q=quick(m,tag);
    if(!best||m.q.score>best.q.score)best=m;
  }
  return best;
}
const CRIT={simplePass:0.02,fair2:0.05,fair3:0.10,look2:0.20,look3:0.30};
function accept(R){
  const s=R.strategies;
  const reasons=[];
  if(!R.countsOK||!R.coverOK||!R.pathOK)reasons.push('合法性');
  for(const k of ['random','triple','top','unlock','greedy'])if(s[k].passRate>CRIT.simplePass)reasons.push(k);
  for(const k of ['fair2','fair3','look2','look3'])if(s[k].passRate>CRIT[k])reasons.push(k);
  if(R.solver.cap3.found||R.solver.cap4.found)reasons.push('存在≤4的低槽位解');
  return reasons;
}

function makeLevel(seed,{cands=8,climb=50,log=()=>{}}={}){
  for(let attempt=0;attempt<4;attempt++){
    const r=C.rngFrom(seed+'#'+attempt);
    let best=null;
    for(let k=0;k<cands;k++){const c=makeCandidate(r);if(!c)continue;c.q=quick(c,seed);if(!best||c.q.score>best.q.score)best=c}
    log(`  候选最佳 ${JSON.stringify(best.q)}`);
    let acc=0;
    for(let it=0;it<climb;it++){const m=mutate(best,r);if(!m)continue;m.q=quick(m,seed);if(m.q.score>=best.q.score){best=m;acc++}}
    log(`  爬山 ${climb} 轮（接受 ${acc}）→ ${JSON.stringify(best.q)}`);
    // 反捷径修牌：反复寻找 ≤4 槽位的简单解并针对性破坏，直到求解器找不到为止
    let sc=findShortcut(best,seed,false),rounds=0;
    while(rounds<16){
      if(!sc){sc=findShortcut(best,seed,true);if(!sc)break}
      const m=repair(best,sc,r,seed);rounds++;if(!m)break;best=m;sc=findShortcut(best,seed,false)}
    log(`  反捷径修牌 ${rounds} 轮，${sc?'仍有捷径':'已找不到捷径'}`);
    best.repairRounds=rounds;
    if(sc){(makeLevel.fails=makeLevel.fails||[]).push('捷径修不掉');continue}
    const R=fullEval(best,seed);R.shortcutRepairRounds=rounds;const why=accept(R);
    log(`  完整评估：${why.length?'未通过 '+why.join(','):'通过'}`);
    log('   '+Object.entries(R.strategies).map(([k,v])=>k+':'+v.wins+'/'+v.runs+'('+v.avgRemoved+')').join(' ')+' | cap4 '+JSON.stringify(R.solver.cap4)+' cap5 '+JSON.stringify(R.solver.cap5)+' cap6 '+JSON.stringify(R.solver.cap6)+' traps '+JSON.stringify(R.traps)+' mid5+ '+R.pathMidOcc5plus);
    if(!why.length)return {level:best,report:R,attempt};
    (makeLevel.fails=makeLevel.fails||[]).push(why.join(','));
  }
  return null;
}

// 编码：每张牌 4 个字符
function encode(c){
  return c.tiles.map((t,i)=>{const ty=c.types[i].toString(16);
    return t.zone==='board'?t.gx.toString(16)+t.gy.toString(16)+t.z.toString(16)+ty:(t.zone==='L'?'l':'r')+t.i.toString(36)+ty+'.'}).join('');
}
module.exports={makeCandidate,quick,mutate,fullEval,accept,makeLevel,encode,CRIT};

if(require.main===module){
  const seed=process.argv[2]||'test1';const t0=Date.now();
  const res=makeLevel(seed,{log:console.log});
  console.log('用时',((Date.now()-t0)/1000).toFixed(1)+'s');
  if(res)console.log(JSON.stringify(res.report,null,1));
}
