'use strict';
const assert=require('node:assert/strict');
const P=require('../engine.js'),A=require('../analysis-core.js');
let checks=0,decisions=0,simulated=0;
function test(name,fn){fn();checks++;console.log('PASS '+name);}
function config(n,seed){const r=P.rng(seed);return {bb:100,button:seed%n,mode:seed%2?'cash':'tournament',anteType:seed%3===0?'each':seed%3===1?'bb':'none',ante:seed%3===2?0:30,rakePct:seed%2?5:0,rakeCap:300,players:Array.from({length:n},(_,i)=>({id:i,name:i===0?'Hero':'Opponent '+i,hero:i===0,profile:Object.keys(P.PROFILES)[(seed+i)%6],stack:200+Math.floor(r()*18000)}))};}

test('real policy distribution is normalized and sensitivity preserves legal actions',()=>{
 const h=new P.Hand(config(6,7),77);const v=h.view();
 for(const o of [{},{calling:.08},{calling:-.08},{aggression:.15,bluff:.08}]){
  const d=A.actionDistribution(v,o);assert.ok(Math.abs(d.reduce((s,x)=>s+x.probability,0)-1)<1e-12);
  for(const a of d){assert.ok(a.probability>=0);if(a.kind==='raise')assert.ok(a.total>=v.legal.minRaise&&a.total<=v.legal.maxRaise);else assert.ok(v.legal[a.kind]);}
 }
});

test('players who have not acted retain all legal equally weighted combinations',()=>{
 const h=new P.Hand({bb:100,button:0,players:[{id:0,name:'Hero',hero:true,stack:10000},{id:1,name:'Villain',profile:'nit',stack:10000}]},12);
 const d={view:h.view(0),action:{kind:'call',total:100,amount:50}};
 const out=A.analyzeDecision(d,{samples:40,seed:12});
 const cs=out.ranges[0].combos;assert.equal(cs.length,1225);assert.ok(cs.every(c=>Math.abs(c.weight-1/1225)<1e-12));
});

test('simulation does not mutate a recorded snapshot or use its seed',()=>{
 const h=new P.Hand({bb:100,button:0,players:[{id:0,name:'Hero',hero:true,stack:10000},{id:1,name:'Villain',profile:'calling-station',stack:10000}]},73);
 const d={view:h.view(0),action:{kind:'call',total:100,amount:50}},before=JSON.stringify(d);
 const x=A.analyzeDecision(d,{samples:40,seed:32});assert.equal(JSON.stringify(d),before);
 const altered=JSON.parse(before);altered.view.seed=42891234;altered.opponentCards=['As','Ad'];altered.futureBoard=['Ks','Qs','Js','Ts','9s'];
 const y=A.analyzeDecision(altered,{samples:40,seed:32});
 assert.deepEqual(x.actions.map(a=>a.ev),y.actions.map(a=>a.ev));
});

test('varied 2–9 seat hands and restored legacy snapshots conserve chips across modeled branches',()=>{
 for(let seed=1;seed<=24;seed++){
  const n=2+seed%8,h=new P.Hand(config(n,seed),seed*12341);let moves=0;
  while(!h.done&&moves++<180){const a=A.bot(h.view());h.act(a.kind,a.amount);}
  assert.ok(h.done);h.assert();simulated++;
  for(const d of h.decisions){
   const out=A.analyzeDecision(d,{samples:40,seed:seed*81,exact:false});decisions++;
   assert.ok(out.actions.every(a=>Number.isFinite(a.ev)&&Number.isFinite(a.se)&&Number.isFinite(a.pairedLossSE)));
   assert.ok(out.actions.some(a=>a.isActual));assert.ok(out.actions.some(a=>a.id===out.bestId));
   assert.ok(out.ranges.every(r=>Math.abs(r.combos.reduce((s,c)=>s+c.weight,0)-1)<1e-9));
   const legacy=JSON.parse(JSON.stringify(d));delete legacy.view.actedAt;delete legacy.view.pending;
   const old=A.analyzeDecision(legacy,{samples:40,seed:seed*81,exact:false});
   assert.deepEqual(old.actions.map(a=>a.ev),out.actions.map(a=>a.ev),'legacy reconstruction must preserve this betting state');
  }
 }
});

console.log(checks+' core test groups passed; '+simulated+' hands / '+decisions+' recorded decisions analyzed.');
