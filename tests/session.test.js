'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../engine.js'),A=require('../analysis-core.js');
global.Poker=P;
require('../legends.js');
require('../analysis-client.js');
const profiles=Object.keys(P.PROFILES),started=performance.now(),saved=[];
let totalActions=0,totalHands=0;
const close=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);
function drive(config,seed){
 const h=new P.Hand(config,seed);let actions=0;
 while(!h.done){
  assert.ok(actions++<220,'Hand must terminate within a finite action count');
  const v=h.view(),legal=h.legal(),a=A.bot(v);
  assert.equal(v.snapshotVersion,2);assert.deepEqual(v.pending,h.pending);assert.deepEqual(v.actedAt,h.players.map(p=>p.actedAt));
  assert.equal(v.board.length,[0,3,4,5][v.street]);assert.equal(v.hole.length,2);
  for(const key of ['runout','deck','fixed','players'])assert.equal(v[key],undefined,'Hidden state '+key+' must not be in snapshots');
  assert.ok(v.opponents.every(p=>!Object.hasOwn(p,'hole')),'Snapshots must not contain opponent hole cards');
  if(a.kind==='raise'){assert.ok(legal.raise);assert.ok(Number.isInteger(a.amount)&&a.amount>=legal.minRaise&&a.amount<=legal.maxRaise);}
  else assert.ok(a.kind==='call'?legal.call>0:legal[a.kind],'Bot action must be legal');
  h.act(a.kind,a.amount);h.assert();
 }
 const initial=config.players.reduce((sum,p)=>sum+p.stack,0),final=h.players.reduce((sum,p)=>sum+p.stack,0)+h.fee;
 assert.equal(final,initial);assert.ok(h.players.every(p=>p.stack>=0));
 saved.push(...h.decisions.map(d=>({d,config:h.config,n:h.n,seed,finalPot:h.finalPot})));
 totalHands++;totalActions+=actions;return h;
}
test('new snapshots preserve public betting order and reopening rights without sharing arrays',()=>{
 const h=new P.Hand({bb:10,button:0,players:[{id:0,hero:true,stack:1000},{id:1,stack:40},{id:2,stack:1000}]},17,{holes:{0:['As','Ah']}});
 h.act('raise',30);h.act('raise',40);h.act('call');
 const v=h.view();assert.deepEqual(v.pending,[0]);assert.deepEqual(v.actedAt,[30,40,40]);assert.equal(v.legal.raise,false);assert.equal(v.legal.reopened,false);assert.equal(v.legal.call,10);
 v.pending.push(1);v.actedAt[0]=999;v.hole[0]=P.card('2h');v.opponents[0].stack=999;
 assert.deepEqual(h.pending,[0]);assert.equal(h.players[0].actedAt,30);assert.deepEqual(h.players[0].hole,['As','Ah'].map(P.card));assert.equal(h.players[1].stack,0);
});
test('96 complete sessions cover 2–9 seats, modes, antes, rake and uneven stacks',()=>{
 for(let n=2;n<=9;n++)for(let k=0;k<12;k++){
  const random=P.rng(10000+n*101+k),bb=k%3===0?100:10,mode=k%2?'tournament':'cash',hero=(k*3+1)%n;
  const config={bb,button:k%n,mode,anteType:mode==='tournament'?(k%3?'bb':'each'):'none',ante:mode==='tournament'?Math.max(1,bb/10):0,rakePct:mode==='cash'&&k%4===0?5:0,rakeCap:3*bb,
   players:Array.from({length:n},(_,i)=>({id:i,name:'Seat '+i,hero:i===hero,stack:Math.round((8+random()*172)*bb),profile:profiles[(k+i+n)%profiles.length]}))};
  drive(config,30000+n*401+k);
 }
 assert.equal(totalHands,96);assert.ok(totalActions>300);assert.ok(saved.some(x=>x.n===9)&&saved.some(x=>x.n===2));assert.ok(saved.some(x=>x.config.mode==='cash')&&saved.some(x=>x.config.mode==='tournament'));
});
test('20 sampled decision analyses remain finite, legal, specific and include the actual size',()=>{
 const selected=[];
 for(let street=0;street<=3;street++){
  const candidates=saved.filter(x=>x.d.view.street===street),priority=candidates.slice().sort((a,b)=>b.d.view.active-a.d.view.active||b.n-a.n);
  assert.ok(priority.length>=5,`Need five recorded decisions on street ${street}; got ${priority.length}`);
  selected.push(...priority.slice(0,5));
 }
 assert.ok(selected.some(x=>x.d.view.active>2));
 for(const {d,config} of selected){
  const r=A.analyzeDecision(d,{samples:40,exact:false,seed:919,rakePct:config.rakePct,rakeCap:config.rakeCap}),actual=r.actions.filter(a=>a.isActual);
  assert.equal(actual.length,1);assert.equal(actual[0].kind,d.action.kind);if(d.action.kind==='raise')assert.equal(actual[0].total,d.action.total);
  assert.ok(r.actions.some(a=>a.id===r.bestId));assert.ok(Number.isFinite(r.loss)&&r.loss>=0);assert.ok(r.reasons.some(x=>x.includes('You chose')));
  for(const a of r.actions){assert.ok(Number.isFinite(a.ev));assert.ok(Number.isFinite(a.se)&&a.se>=0);assert.ok(Number.isFinite(a.pairedLossSE)&&a.pairedLossSE>=0);if(a.kind==='raise')assert.ok(d.view.legal.raise&&a.total>=d.view.legal.minRaise&&a.total<=d.view.legal.maxRaise);}
  for(const range of r.ranges){close(range.combos.reduce((sum,c)=>sum+c.weight,0),1,1e-8);for(const c of range.combos)assert.ok(!c.cards.some(card=>d.view.hole.concat(d.view.board).includes(card)));}
 }
});
test('worker input strips deal seed and hidden/private hand metadata',()=>{
 const x=saved.find(x=>x.d.view.street===1),d=JSON.parse(JSON.stringify(x.d));d.view.runout=[1,2,3,4,5];d.view.deck=[6,7];d.view.opponents[0].hole=[8,9];d.action.note='Private training note';d.actualVillainCards=[10,11];
 const clean=P.AnalysisClient.publicInput(d);assert.equal(clean.view.seed,undefined);assert.equal(clean.view.runout,undefined);assert.equal(clean.view.deck,undefined);assert.equal(clean.view.opponents[0].hole,undefined);assert.equal(clean.action.note,undefined);assert.equal(clean.actualVillainCards,undefined);assert.deepEqual(clean.view.pending,d.view.pending);assert.deepEqual(clean.view.actedAt,d.view.actedAt);
});
function knownRiver(mode='cash'){
 const h=new P.Hand({bb:10,button:0,mode,players:[{id:0,hero:true,stack:300},{id:1,stack:500},{id:2,stack:200}]},91,{holes:{0:['Js','Jc']},board:['3s','7d','4h','Ac','8s']});
 h.act('raise',20);h.act('call');h.act('fold');h.act('check');h.act('check');h.act('check');h.act('check');h.act('raise',480);
 return {view:h.view(),action:{kind:'call',amount:280,total:280}};
}
const balancedRange={1:[{cards:['Ad','Kd'],weight:1},{cards:['Kd','Qd'],weight:1}]};
test('legacy river snapshots recover the same exact comparison',()=>{
 const d=knownRiver(),opts={rangesOverride:balancedRange,samples:40,seed:981,rakePct:0,rakeCap:0},modern=A.analyzeDecision(d,opts),old=JSON.parse(JSON.stringify(d));
 for(const key of ['snapshotVersion','id','name','start','sb','rakePct','rakeCap','anteType','ante','pending','actedAt'])delete old.view[key];old.view.opponents.forEach(o=>delete o.start);
 const legacy=A.analyzeDecision(old,opts);assert.equal(legacy.bestId,modern.bestId);for(const row of modern.actions){const other=legacy.actions.find(x=>x.id===row.id);close(other.ev,row.ev);close(other.se,row.se);}close(legacy.loss,modern.loss);
});
function independentThreePlayerICM(stacks,payouts){
 if(stacks[0]===0)return payouts[2];const total=stacks.reduce((a,b)=>a+b,0),first=stacks[0]/total,second=stacks.slice(1).reduce((s,x)=>s+(x/total)*(stacks[0]/(total-x)),0);return first*payouts[0]+second*payouts[1]+(1-first-second)*payouts[2];
}
test('ICM meaningfully reverses a positive chip-EV call near a pay jump',()=>{
 const d=knownRiver('tournament'),opts={rangesOverride:balancedRange,samples:40,seed:851},chip=A.analyzeDecision(d,opts),pay=A.analyzeDecision(d,{...opts,tournament:{payouts:[50,30,20],otherStacks:[]}});
 // Call: win 610/200/190 or lose 0/810/190, each with probability 1/2.
 // Fold: keep 280 while villain holds 530 and the folded player 190.
 const expected=.5*independentThreePlayerICM([610,200,190],[50,30,20])+.5*20-independentThreePlayerICM([280,530,190],[50,30,20]);
 close(chip.actions.find(a=>a.kind==='call').ev,2.5);assert.equal(chip.bestId,'call');assert.ok(expected<0);close(pay.actions.find(a=>a.kind==='call').ev,expected);assert.equal(pay.bestId,'fold');assert.equal(pay.unit,'payout');
});
test('sampled large-field payout utility is labeled and has numerical error',()=>{
 const d=knownRiver('tournament'),r=A.analyzeDecision(d,{rangesOverride:balancedRange,samples:40,seed:15,tournament:{payouts:[100,60,40,30,20,10],otherStacks:Array(9).fill(200)}});
 assert.equal(r.stats.sampledICM,true);assert.match(r.method,/sampled ICM/);assert.ok(r.actions.some(a=>a.icmSE>0));assert.ok(r.assumptions.some(s=>/not ICM-optimized/.test(s)));r.actions.forEach(a=>assert.ok(Number.isFinite(a.ev)&&a.se>=0));
});
test('session verification summary',()=>console.log(JSON.stringify({hands:totalHands,actions:totalActions,recordedHeroDecisions:saved.length,elapsedMs:Math.round(performance.now()-started)})));
