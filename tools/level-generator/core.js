// 肉了个肉 · 地狱关卡生成 / 求解 / 评估核心（离线运行）
'use strict';
const TW = 46, FH = 48, BX = 19, BY = 80;
const NTYPES = 16, SLOT = 7;

// ---------- 随机 ----------
function seedOf(s){let h=1779033703^s.length;for(let i=0;i<s.length;i++){h=Math.imul(h^s.charCodeAt(i),3432918353);h=h<<13|h>>>19}
  h=Math.imul(h^h>>>16,2246822507);h=Math.imul(h^h>>>13,3266489909);return (h^h>>>16)>>>0}
function rngFrom(s){let a=typeof s==='number'?s>>>0:seedOf(String(s));return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function shuffle(a,r){for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function pickW(items,ws,r){let s=0;for(const w of ws)s+=w;let x=r()*s;for(let i=0;i<items.length;i++){if((x-=ws[i])<=0)return items[i]}return items[items.length-1]}

// ---------- 布局：主牌区 8~12 层 + 左右两摞 ----------
function genLayout(p, r){
  const {layers:L, board:B, stack:S} = p;
  const w=p.half??6,gx0=6-w,gx1=6+w,gy0=0,gy1=14;
  const layerOff=[];const used=[];const tiles=[];
  const cellsOf=(ox,oy)=>{const c=[];for(let gy=gy0+oy;gy<=gy1;gy+=2)for(let gx=gx0+ox;gx<=6;gx+=2)c.push([gx,gy]);return c};
  // 每层的平均张数，控制上下层大致均匀（上层稍少）
  for(let z=0;z<L;z++){
    const ox=r()<.5?0:1, oy=r()<.5?0:1; layerOff.push([ox,oy]); used.push(new Set());
    const target=B/L*(1.15-0.3*z/(L-1))*(0.8+0.4*r());
    const cells=shuffle(cellsOf(ox,oy),r);
    let cnt=0;
    for(const [gx,gy] of cells){
      if(cnt>=target)break;
      const m=12-gx;
      tiles.push({gx,gy,z});used[z].add(gx+','+gy);cnt++;
      if(m!==gx&&cnt<target+1){tiles.push({gx:m,gy,z});used[z].add(m+','+gy);cnt++}
    }
  }
  // 补足 / 裁剪到目标张数
  let guard=0;
  while(tiles.length<B&&guard++<5000){
    const z=Math.floor(r()*L),[ox,oy]=layerOff[z];
    const cells=cellsOf(ox,oy).filter(([gx,gy])=>!used[z].has(gx+','+gy));
    if(!cells.length)continue;
    const [gx,gy]=cells[Math.floor(r()*cells.length)];
    tiles.push({gx,gy,z});used[z].add(gx+','+gy);
  }
  while(tiles.length>B){
    const top=Math.max(...tiles.map(t=>t.z));const c=tiles.filter(t=>t.z>=top-1);
    tiles.splice(tiles.indexOf(c[Math.floor(r()*c.length)]),1);
  }
  const out=tiles.map(t=>({zone:'board',gx:t.gx,gy:t.gy,z:t.z,x:BX+t.gx*TW/2,y:BY+t.gy*FH/2}));
  for(let i=0;i<S;i++){
    out.push({zone:'L',i,z:i,x:18+i*4,y:476});
    out.push({zone:'R',i,z:i,x:360-18-TW-i*4,y:476});
  }
  return out;
}
const overlaps=(a,b)=>Math.abs(a.x-b.x)<TW&&Math.abs(a.y-b.y)<FH;

// 遮挡图：under[i] = i 压住的牌；covN[i] = 压住 i 的牌数
function buildCover(tiles){
  const n=tiles.length,under=Array.from({length:n},()=>[]),covN=new Int16Array(n);
  for(let i=0;i<n;i++)for(let j=0;j<n;j++){
    if(i!==j&&tiles[j].z>tiles[i].z&&overlaps(tiles[i],tiles[j])){under[j].push(i);covN[i]++}
  }
  // 解锁深度：从顶部到这张牌最长的遮挡链
  const depth=new Int16Array(n);const order=[...Array(n).keys()].sort((a,b)=>tiles[b].z-tiles[a].z);
  for(const j of order)for(const i of under[j])depth[i]=Math.max(depth[i],depth[j]+1);
  return {under,covN,depth};
}

// ---------- 引擎：状态 = 已拿走的牌集合（槽位 = 每种已拿数 mod 3） ----------
class Engine{
  constructor(tiles,types){
    this.n=tiles.length;this.type=Int8Array.from(types);
    const c=buildCover(tiles);this.under=c.under;this.covN0=c.covN;this.depth=c.depth;
    // 可见性：主牌区按四个象限算，只要有一个象限没被完全盖住就能认出图案；两摞只有最上面一张可见
    this.isStack=Uint8Array.from(tiles,t=>t.zone==='board'?0:1);
    this.qunder=Array.from({length:this.n},()=>[]);this.qcov0=new Int16Array(this.n*4);
    for(let i=0;i<this.n;i++){if(this.isStack[i])continue;const a=tiles[i];
      for(let q=0;q<4;q++){const qx=a.x+(q&1)*TW/2,qy=a.y+(q>>1)*FH/2;
        for(let j=0;j<this.n;j++){const b=tiles[j];if(j===i||b.z<=a.z||this.isStack[j])continue;
          if(b.x<=qx&&b.x+TW>=qx+TW/2&&b.y<=qy&&b.y+FH>=qy+FH/2){this.qunder[j].push(i*4+q);this.qcov0[i*4+q]++}}}}
    const zr=rngFrom(12345);this.z1=new Int32Array(this.n);this.z2=new Int32Array(this.n);
    for(let i=0;i<this.n;i++){this.z1[i]=(zr()*4294967296)|0;this.z2[i]=(zr()*4294967296)|0}
    this.reset();
  }
  reset(){
    const n=this.n;this.cov=Int16Array.from(this.covN0);this.qcov=Int16Array.from(this.qcov0);this.gone=new Uint8Array(n);
    this.slot=new Int8Array(NTYPES);this.occ=0;this.left=n;this.h1=0;this.h2=0;
    this.free=[];this.fpos=new Int32Array(n).fill(-1);
    for(let i=0;i<n;i++)if(this.cov[i]===0)this._fadd(i);
  }
  _fadd(i){this.fpos[i]=this.free.length;this.free.push(i)}
  _fdel(i){const p=this.fpos[i],last=this.free.pop();if(last!==i){this.free[p]=last;this.fpos[last]=p}this.fpos[i]=-1}
  key(){return (this.h1>>>0)*2097152+((this.h2>>>0)&0x1fffff)}
  // 拿一张牌；返回拿完后的槽位占用（7 = 失败）
  take(i){
    this._fdel(i);this.gone[i]=1;this.left--;this.h1^=this.z1[i];this.h2^=this.z2[i];
    for(const j of this.under[i])if(--this.cov[j]===0)this._fadd(j);
    for(const q of this.qunder[i])this.qcov[q]--;
    const t=this.type[i];if(this.slot[t]===2){this.slot[t]=0;this.occ-=2}else{this.slot[t]++;this.occ++}
    return this.occ;
  }
  undo(i){
    const t=this.type[i];if(this.slot[t]===0){this.slot[t]=2;this.occ+=2}else{this.slot[t]--;this.occ--}
    for(const j of this.under[i]){if(this.cov[j]===0)this._fdel(j);this.cov[j]++}
    for(const q of this.qunder[i])this.qcov[q]++;
    this.gone[i]=0;this.left++;this.h1^=this.z1[i];this.h2^=this.z2[i];this._fadd(i);
  }
  visible(i){if(this.gone[i])return false;if(this.cov[i]===0)return true;if(this.isStack[i])return false;
    const q=this.qcov,b=i*4;return q[b]===0||q[b+1]===0||q[b+2]===0||q[b+3]===0}
  occAfter(i){const t=this.type[i];return this.slot[t]===2?this.occ-2:this.occ+1}
  unlocks(i){let k=0;for(const j of this.under[i])if(this.cov[j]===1)k++;return k}
}

// ---------- 完整求解器：DFS + 置换表，cap = 槽位占用上限 ----------
function solve(eng,{cap=6,budget=2e6,orderMode='smart',rng=null}={}){
  const seen=new Set();let nodes=0,out=false;const path=[];
  const rec=()=>{
    if(eng.left===0)return true;
    if(++nodes>budget){out=true;return false}
    const k=eng.key();if(seen.has(k))return false;
    const mv=[];
    for(const i of eng.free){const o=eng.occAfter(i);if(o<=cap&&o<SLOT)mv.push(i)}
    if(orderMode==='smart'){
      const sc=i=>(eng.slot[eng.type[i]]===2?1000:eng.slot[eng.type[i]]===1?100:0)+eng.unlocks(i)*3+eng.depth[i]*0;
      mv.sort((a,b)=>sc(b)-sc(a));
    }else if(orderMode==='rand'){
      const sc=new Map(mv.map(i=>[i,(eng.slot[eng.type[i]]===2?1000:0)+rng()*200+eng.unlocks(i)*20*rng()]));mv.sort((a,b)=>sc.get(b)-sc.get(a));
    }
    for(const i of mv){
      eng.take(i);path.push(i);
      if(rec())return true;
      path.pop();eng.undo(i);if(out)return false;
    }
    seen.add(k);return false;
  };
  eng.reset();const ok=rec();
  const res={found:ok,exhausted:!ok&&!out,nodes,states:seen.size,path:ok?path.slice():null};
  eng.reset();return res;
}

// ---------- 模拟玩家策略 ----------
function completes(e,i){return e.slot[e.type[i]]===2}
function pairs(e,i){return e.slot[e.type[i]]===1}
function freeCountOf(e,t){let k=0;for(const j of e.free)if(e.type[j]===t)k++;return k}
const STRATS={
  // 随手点
  random:(e,r)=>e.free[Math.floor(r()*e.free.length)],
  // 优先三消：能消就消 > 能成对 > 场上能凑齐三张的 > 随机
  triple:(e,r)=>{
    let best=[],bs=-1;
    for(const i of e.free){const t=e.type[i];
      const s=e.slot[t]===2?4:e.slot[t]===1?3:freeCountOf(e,t)>=3?2:1;
      if(s>bs){bs=s;best=[i]}else if(s===bs)best.push(i)}
    return best[Math.floor(r()*best.length)];
  },
  // 优先上层牌（层数高、能消的优先）
  top:(e,r,T)=>{
    let best=[],bs=-1e9;
    for(const i of e.free){const s=T[i].z*10+(completes(e,i)?5:pairs(e,i)?2:0);if(s>bs){bs=s;best=[i]}else if(s===bs)best.push(i)}
    return best[Math.floor(r()*best.length)];
  },
  // 优先解锁更多牌
  unlock:(e,r)=>{
    let best=[],bs=-1e9;
    for(const i of e.free){const s=e.unlocks(i)*10+(completes(e,i)?5:pairs(e,i)?2:0);if(s>bs){bs=s;best=[i]}else if(s===bs)best.push(i)}
    return best[Math.floor(r()*best.length)];
  },
  // 贪心：综合打分，避开会直接导致满槽的牌
  greedy:(e,r)=>{
    let best=[],bs=-1e9;
    for(const i of e.free){const t=e.type[i],c=e.slot[t];
      let s=c===2?100:c===1?30:0;
      if(c===0)s+=freeCountOf(e,t)>=3?20:-10*Math.max(0,e.occ-3);
      s+=e.unlocks(i)*4;
      if(e.occAfter(i)>=SLOT)s-=1000;
      s+=r()*0.5;
      if(s>bs){bs=s;best=[i]}else if(s===bs)best.push(i)}
    return best[0];
  },
};
function evalState(e){
  if(e.occ>=SLOT)return -1e9;
  let comp=0,pr=0;for(const i of e.free){const c=e.slot[e.type[i]];if(c===2)comp++;else if(c===1)pr++}
  return -e.occ*12+comp*6+pr*2+e.free.length*0.6-e.left*0.2;
}
function lookVal(e,d){
  if(e.left===0)return 1e9;
  if(d===0)return evalState(e);
  let best=-1e9;const mv=e.free.slice();
  for(const i of mv){if(e.occAfter(i)>=SLOT)continue;e.take(i);const v=lookVal(e,d-1);e.undo(i);if(v>best)best=v;if(best>=1e9)break}
  return best;
}
function lookaheadStrat(depth){
  return (e,r)=>{
    let best=[],bs=-Infinity;const mv=e.free.slice();
    for(const i of mv){
      if(e.occAfter(i)>=SLOT){if(bs===-Infinity&&!best.length)best=[i];continue}
      e.take(i);const v=lookVal(e,depth-1)+r()*0.01;e.undo(i);
      if(v>bs){bs=v;best=[i]}
    }
    return best[0];
  };
}
// 信息公平的前瞻：只知道当前看得见的牌（与真人一致），看不见的牌既不能计划也不计入评估
function evalFair(e,K){
  if(e.occ>=SLOT)return -1e9;
  let comp=0,pr=0,fk=0;for(const i of e.free){if(!K[i])continue;fk++;const c=e.slot[e.type[i]];if(c===2)comp++;else if(c===1)pr++}
  return -e.occ*12+comp*6+pr*2+fk*0.6-e.left*0.2;
}
function lookFair(e,d,K){
  if(e.left===0)return 1e9;if(d===0)return evalFair(e,K);
  let best=-1e9;const mv=e.free.filter(i=>K[i]);
  for(const i of mv){if(e.occAfter(i)>=SLOT)continue;e.take(i);const v=lookFair(e,d-1,K);e.undo(i);if(v>best)best=v;if(best>=1e9)break}
  return best;
}
function lookaheadFairStrat(depth){
  return (e,r)=>{
    const K=new Uint8Array(e.n);for(let i=0;i<e.n;i++)K[i]=e.visible(i)?1:0;
    let best=[],bs=-Infinity;const mv=e.free.slice();
    for(const i of mv){
      if(e.occAfter(i)>=SLOT){if(!best.length)best=[i];continue}
      e.take(i);const v=lookFair(e,depth-1,K)+r()*0.01;e.undo(i);
      if(v>bs){bs=v;best=[i]}
    }
    return best[0];
  };
}
function play(e,T,choose,r){
  e.reset();let peak=0;
  while(e.left>0){const i=choose(e,r,T);const o=e.take(i);if(o>=SLOT)break;if(o>peak)peak=o}
  const res={win:e.left===0,removed:e.n-e.left,peak};e.reset();return res;
}

// ---------- 预设通关路径（拿牌顺序）+ 压槽式图案分配 ----------
function genSequence(tiles,cover,r,stackDelay){
  const n=tiles.length,cov=Int16Array.from(cover.covN),gone=new Uint8Array(n),seq=[];
  let free=[];for(let i=0;i<n;i++)if(!cov[i])free.push(i);
  for(let s=0;s<n;s++){
    const prog=s/n;
    // 两摞的牌在预设路径里尽量晚拿：早拿两摞就是陷阱
    const ws=free.map(i=>tiles[i].zone==='board'?1+cover.depth[i]*0.15:Math.max(0.03,(prog-stackDelay)*3));
    const i=pickW(free,ws,r);seq.push(i);gone[i]=1;free.splice(free.indexOf(i),1);
    for(const j of cover.under[i])if(--cov[j]===0)free.push(j);
  }
  return seq;
}
function assignOnSeq(n,seq,r,opt,start=0,prefix=null){
  const cap=6,types=new Int8Array(n),quota=new Int16Array(NTYPES);
  for(let k=0;k<n/3;k++)quota[k%NTYPES]++;
  const pend=new Map();let occ=0;
  for(let s=0;s<start;s++){const t=prefix[seq[s]];types[seq[s]]=t;const c=pend.get(t)||0;
    if(c===0){quota[t]--;pend.set(t,1);occ++}else if(c===1){pend.set(t,2);occ++}else{pend.delete(t);occ-=2}}
  for(let s=start;s<n;s++){
    const rem=n-s-1;let need=0,has2=false;for(const c of pend.values()){need+=3-c;if(c===2)has2=true}
    const mv=[],w=[];
    const openable=[];for(let t=0;t<NTYPES;t++)if(quota[t]>0&&!pend.has(t))openable.push(t);
    if(openable.length&&occ+1<=cap&&need+2<=rem&&(occ+1<cap||has2)){
      // 优先打开配额多的图案，保证各图案均匀
      const t=pickW(openable,openable.map(t=>quota[t]),r);
      mv.push({t,open:1});w.push(occ<opt.hi-1?6:occ<opt.hi?1.5:0.5);
    }
    const pl=[...pend];
    pl.forEach(([t,c],idx)=>{
      if(c===1&&occ+1<=cap){mv.push({t});w.push(2)}
      // 完成三消：槽位接近满时才完成；更倾向完成"新"的对子，让老对子长期滞留
      if(c===2){mv.push({t});w.push((occ>=opt.hi?4:0.25)*(1+idx/pl.length*opt.keepOld))}
    });
    if(!mv.length)return null;
    const m=pickW(mv,w,r);types[seq[s]]=m.t;
    if(m.open){quota[m.t]--;pend.set(m.t,1);occ++}
    else if(pend.get(m.t)===1){pend.set(m.t,2);occ++}
    else{pend.delete(m.t);occ-=2}
  }
  return pend.size?null:types;
}
// 按预设路径模拟，返回占用曲线；非法则返回 null
function simulateSeq(types,seq){
  const slot=new Int8Array(NTYPES);let occ=0;const curve=[];
  for(const i of seq){const t=types[i];if(slot[t]===2){slot[t]=0;occ-=2}else{slot[t]++;occ++;if(occ>=SLOT)return null}curve.push(occ)}
  return occ===0?curve:null;
}

module.exports={TW,FH,BX,BY,NTYPES,SLOT,rngFrom,shuffle,pickW,genLayout,overlaps,buildCover,Engine,solve,STRATS,lookaheadStrat,lookaheadFairStrat,play,genSequence,assignOnSeq,simulateSeq};
