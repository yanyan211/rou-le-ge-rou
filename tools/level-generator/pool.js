// 批量预生成关卡池：node pool.js 起始 结束 输出文件
const fs=require('fs');const B=require('./build');
const [a,b,out]=[+process.argv[2],+process.argv[3],process.argv[4]];
for(let k=a;k<b;k++){
  const t0=Date.now();B.makeLevel.fails=[];const res=B.makeLevel('day'+k);
  if(!res){fs.appendFileSync(out,JSON.stringify({k,fail:true,why:B.makeLevel.fails})+'\n');B.makeLevel.fails=[];continue}
  fs.appendFileSync(out,JSON.stringify({k,ms:Date.now()-t0,attempt:res.attempt,code:B.encode(res.level),seq:Array.from(res.level.seq),report:(delete res.report._shortcut,res.report)})+'\n');
}
