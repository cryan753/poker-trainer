'use strict';
// Independent integration checks for decision EV, information isolation, and
// reference formulas. No sampled result is compared with its own implementation.
const assert=require('node:assert/strict');
const P=require('../engine.js'),A=require('../analysis-core.js'),R=require('../analysis-reference.js');
let passed=0;function test(name,fn){try{fn();passed++;console.log('PASS '+name);}catch(e){console.error('FAIL '+name);throw e;}}
const near=(x,y,t=1e-9)=>assert.ok(Math.abs(x-y)<=t,`${x} != ${y}`);
function river(hole=['Js','Jc'],board=['3s','7d','4h','Ac','8s']){
 const h=new P.Hand({bb:10,button:0,mode:'cash',players:[{id:0,name:'Hero',hero:true,stack:50},{id:1,name:'Villain',profile:'tight-passive',stack:30}]},123,{holes:{0:hole},board});
 h.act('call');h.act('check');h.act('check');h.act('check');h.act('check');h.act('check');h.act('raise',20);
 return {view:h.view(),action:{kind:'call',amount:20,total:20}};
}
const range=[{cards:['Ad','Kd'],weight:4},{cards:['Kd','Qd'],weight:1}];
test('exact river call matches independent weighted-range EV',()=>{const d=river(),r=A.analyzeDecision(d,{rangesOverride:{1:range},samples:40}),q=R.equityExact(d.view.hole,d.view.board,range).equity,expect=R.terminalCall({pot:d.view.pot,call:20,equity:q}).callEV/10;near(r.actions.find(x=>x.kind==='call').ev,expect);near(expect,-.8);near(r.actions.find(x=>x.kind==='fold').ev,0);assert.equal(r.bestId,'fold');});
test('exact river call applies integer capped rake',()=>{const d=river(),r=A.analyzeDecision(d,{rangesOverride:{1:range},rakePct:5,rakeCap:3,samples:40});near(r.actions.find(x=>x.kind==='call').ev,-.86);});
test('plausible range change reverses recommendation',()=>{const d=river(),wide=[{cards:['Ad','Kd'],weight:1},{cards:['Kd','Qd'],weight:4}],r=A.analyzeDecision(d,{rangesOverride:{1:wide},samples:40});near(r.actions.find(x=>x.kind==='call').ev,2.8);assert.equal(r.bestId,'call');});
test('split-pot showdown credits half the final pot',()=>{const d=river(['2d','3c'],['Ac','Kd','Qh','Js','Tc']),r=A.analyzeDecision(d,{rangesOverride:{1:[{cards:['4d','5h'],weight:1}]},samples:40});near(r.actions.find(x=>x.kind==='call').ev,1);});
test('actual unseen villain cards and future seed cannot change report',()=>{const d=river(),opts={rangesOverride:{1:range},samples:40,seed:17},a=A.analyzeDecision(d,opts);d.view.seed=99999;d.view.opponents[0].hole=['2c','2h'];d.futureBoard=['Ad','Kd'];d.runout=['Ac','Ah','As','Kh','Ks'];const b=A.analyzeDecision(d,opts);assert.deepEqual(a.actions,b.actions);assert.equal(a.bestId,b.bestId);near(a.loss,b.loss);});
test('changing observed cards must change numeric evidence',()=>{const d=river(),opts={rangesOverride:{1:range},samples:40},a=A.analyzeDecision(d,opts);d.view.hole=['5d','6h'];const b=A.analyzeDecision(d,opts);assert.notEqual(a.actions.find(x=>x.kind==='call').ev,b.actions.find(x=>x.kind==='call').ev);});
test('exact custom chosen bet is included among alternatives',()=>{
 const h=new P.Hand({bb:10,button:0,players:[{id:0,hero:true,stack:1000},{id:1,stack:1000}]},10,{holes:{0:['As','Ah']},board:['2c','7d','9h','3s','4c']});h.act('call');h.act('check');h.act('check');h.act('check');h.act('check');h.act('check');h.act('check');const d={view:h.view(),action:{kind:'raise',total:37,amount:37}};
 const r=A.analyzeDecision(d,{rangesOverride:{1:[{cards:['Kd','Kh'],weight:1}]},samples:40});const a=r.actions.find(x=>x.isActual);assert.equal(a.total,37);assert.equal(a.id,'raise:37');
});
test('sampled path preserves legal choices without throwing when fold leads',()=>{
 const d=river();const r=A.analyzeDecision(d,{rangesOverride:{1:range},samples:40,exact:false,seed:5});assert.equal(r.actions.filter(a=>a.isActual).length,1);r.actions.forEach(a=>assert.ok(Number.isFinite(a.ev)&&Number.isFinite(a.se)));
});
test('raising rights remain closed after a short raise',()=>{
 const h=new P.Hand({bb:10,button:0,players:[{id:0,hero:true,stack:1000},{id:1,stack:1000},{id:2,stack:1000}]},99,{holes:{0:['As','Ah']}});const v=h.view();v.legal.raise=false;v.legal.reopened=false;v.actedAt=[v.currentBet,null,null];
 const r=A.analyzeDecision({view:v,action:{kind:'fold',amount:0,total:v.bet}},{samples:40,exact:false,seed:17});assert.ok(!r.actions.some(a=>a.kind==='raise'));
});
test('turn closing-call equity discounts dirty flush outs',()=>{
 const h=new P.Hand({bb:10,button:0,mode:'cash',players:[{id:0,hero:true,stack:50},{id:1,stack:30}]},55,{holes:{0:['As','Qs'],1:['8h','8d']},board:['Js','8s','4d','2h','9c']});
 h.act('call');h.act('check');h.act('check');h.act('check');h.act('raise',20);
 const d={view:h.view(),action:{kind:'call',amount:20,total:20}},r=A.analyzeDecision(d,{rangesOverride:{1:[{cards:['8h','8d'],weight:1}]},samples:40,seed:7}),call=r.actions.find(a=>a.kind==='call');
 near(call.ev,((7/44)*60-20)/10);assert.equal(call.se,0);assert.match(call.method,/exact terminal/);
});
test('multiway unequal all-ins award each contestable pot',()=>{
 const h=new P.Hand({bb:10,button:0,mode:'cash',players:[{id:0,hero:true,stack:50},{id:1,stack:30},{id:2,stack:80}]},69,{holes:{0:['As','Ah'],1:['Kc','Kd'],2:['Qc','Qd']},board:['2c','3d','7h','8s','9c']});
 h.act('call');h.act('call');h.act('check');for(let s=0;s<2;s++){h.act('check');h.act('check');h.act('check');}h.act('raise',20);h.act('raise',70);
 const d={view:h.view(),action:{kind:'call',amount:40,total:40}},r=A.analyzeDecision(d,{rangesOverride:{1:[{cards:['Kc','Kd'],weight:1}],2:[{cards:['Qc','Qd'],weight:1}]},samples:40,seed:21}),call=r.actions.find(a=>a.kind==='call');
 near(call.ev,9);assert.equal(r.bestId,'call');
});
test('multiway range overrides cannot assign one card twice',()=>{
 const h=new P.Hand({bb:10,button:0,players:[{id:0,hero:true,stack:100},{id:1,stack:100},{id:2,stack:100}]},71,{holes:{0:['As','Ah']}}),d={view:h.view(),action:{kind:'call',amount:10,total:10}};
 assert.throws(()=>A.analyzeDecision(d,{rangesOverride:{1:[{cards:['Kc','Kd'],weight:1}],2:[{cards:['Kc','Qd'],weight:1}]},samples:40}),/no consistent card assignment/);
});
console.log(`${passed} independent analysis audit tests passed.`);
