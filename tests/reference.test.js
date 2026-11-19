'use strict';
const assert=require('node:assert/strict');
const P=require('../engine.js'),R=require('../analysis-reference.js');
let passed=0;function test(name,fn){try{fn();passed++;console.log('PASS '+name);}catch(e){console.error('FAIL '+name);throw e;}}
const near=(x,y,t=1e-10)=>assert.ok(Math.abs(x-y)<=t,`${x} != ${y}`);
function river(){
 const h=new P.Hand({bb:10,button:0,mode:'cash',players:[{id:0,name:'Hero',hero:true,stack:1000},{id:1,name:'Villain',profile:'tight-passive',stack:1000}]},123,{holes:{0:['Js','Jc'],1:['Ad','Kd']},board:['3s','7d','4h','Ac','8s']});
 h.act('call');h.act('check');h.act('check');h.act('check');h.act('check');h.act('check');h.act('raise',10);
 return {view:h.view(),action:{kind:'call',amount:10,total:10}};
}
function reference(){const d=river(),r=R.template(d);r.title='Independent test reference';r.source={tool:'Manual analytic fixture',version:'1',url:'https://example.org/fixture',notes:'Test data, not solver output'};r.assumptions={solutionType:'fixed-policy',ranges:{0:[{cards:['Js','Jc'],weight:1}],1:[{cards:['Ad','Kd'],weight:4},{cards:['Kd','Qd'],weight:1}]},tree:{description:'River fold or call; no further raises.'},continuation:'No future action after call.'};r.actions=[{kind:'fold',total:0,ev:0,frequency:.8},{kind:'call',total:10,ev:-.2,frequency:.2}];return r;}
test('all built-in independently known arithmetic checks pass',()=>{const r=R.runBenchmarks();assert.equal(r.passed,12);assert.equal(r.total,12);});
test('river terminal call formula includes tie share and rake',()=>{const r=R.terminalCall({pot:60,call:20,equity:.5,rakePct:5,rakeCap:3});near(r.callEV,18.5);near(r.requiredEquity,20/77);});
test('reject impossible equity input',()=>assert.throws(()=>R.terminalCall({pot:60,call:20,equity:1.1}),/Equity/));
test('pure bluff zero fold and all folds are exact',()=>{near(R.pureBluff(45,30,0).ev,-30);near(R.pureBluff(45,30,1).ev,45);});
test('turn count excludes both known hands',()=>{const r=R.equityExact(['As','Qs'],['Js','8s','4d','2h'],[{cards:['8h','8d'],weight:1}]);assert.equal(r.deals,44);near(r.equity,7/44);});
test('flop exact enumeration has 990 runouts against known hand',()=>{const r=R.equityExact(['As','Ah'],['2c','3d','7h'],[{cards:['Kc','Kd'],weight:1}]);assert.equal(r.deals,990);assert.ok(r.equity>0&&r.equity<1);});
test('reject blocked range cards and duplicate hero cards',()=>{assert.throws(()=>R.equityExact(['As','As'],['2c','3d','7h'],[{cards:['Kc','Kd'],weight:1}]),/duplicate/);assert.throws(()=>R.equityExact(['As','Ah'],['2c','3d','7h'],[{cards:['As','Kd'],weight:1}]),/already held/);});
test('toy game is indifferent for defender and pure air',()=>{const t=R.toyRiver({pot:100,bet:50,valueFraction:.4});near(t.airBetEV,0);near(t.defenderCallEV,0);near(t.airBetFrequency,2/9);near(t.defenderCallFrequency,2/3);});
test('toy game handles insufficient bluffs',()=>{const t=R.toyRiver({pot:100,bet:100,valueFraction:.9});near(t.airBetFrequency,1);near(t.defenderCallFrequency,0);assert.ok(t.defenderCallEV<0);});
test('template deliberately refuses grading until populated',()=>assert.throws(()=>R.parse(R.template(river())),/Range/));
test('complete reference imports and JSON round trips',()=>{const r=R.parse(reference());assert.deepEqual(R.parse(JSON.stringify(r)),r);assert.equal(r.source.verification,'User supplied; not independently verified');});
test('many fractional weights keep a stable reference fingerprint',()=>{const r=reference(),board=new Set(r.state.board),cs=Array.from({length:52},(_,i)=>i).filter(c=>!board.has(c)),range=[];for(let i=0;i<8;i++)for(let j=i+1;j<12;j++)range.push({cards:[cs[i],cs[j]],weight:(i+1)*(j+2)+.17});r.assumptions.ranges[1]=range;const parsed=R.parse(r);assert.deepEqual(R.parse(JSON.stringify(parsed)),parsed);});
test('state match alone does not claim strategy match',()=>{const m=R.match(reference(),river());assert.equal(m.stateMatches,true);assert.equal(m.assumptionsMatch,false);assert.equal(m.matched,false);});
test('explicit identical strategy assumptions can match',()=>{const r=reference(),m=R.match(r,river(),{referenceAssumptions:r.assumptions});assert.equal(m.matched,true);assert.match(m.reason,/user supplied/);});
test('actual chosen action does not change reference state',()=>{const d=river();d.action={kind:'fold',total:0,amount:0};assert.equal(R.match(reference(),d).stateMatches,true);});
test('seed, names, future hidden cards do not affect matching',()=>{const d=river();d.view.seed=999;d.view.opponents[0].name='Changed';d.view.opponents[0].hole=['2d','2h'];d.futureBoard=['As'];assert.equal(R.match(reference(),d).stateMatches,true);});
test('changing board does not silently match',()=>{const d=river();d.view.board[4]=P.card('9s');d.view.history.forEach(e=>{if(e.board?.length===5)e.board[4]=P.card('9s');});assert.equal(R.match(reference(),d).stateMatches,false);});
test('changing pot contributions does not match',()=>{const d=river();d.view.opponents[0].total+=10;d.view.pot+=10;assert.equal(R.match(reference(),d).stateMatches,false);});
test('changing rake does not match',()=>assert.equal(R.match(reference(),river(),{rakePct:5,rakeCap:30}).stateMatches,false));
test('changing stack does not match',()=>{const d=river();d.view.opponents[0].stack-=10;assert.equal(R.match(reference(),d).stateMatches,false);});
test('changing action history does not match',()=>{const d=river();d.view.history[0].amount+=1;assert.equal(R.match(reference(),d).stateMatches,false);});
test('different range weights do not match assumptions',()=>{const r=reference(),a=JSON.parse(JSON.stringify(r.assumptions));a.ranges[1][0].weight=2;assert.equal(R.match(r,river(),{referenceAssumptions:a}).assumptionsMatch,false);});
test('different continuation description does not match',()=>{const r=reference(),a=JSON.parse(JSON.stringify(r.assumptions));a.continuation='Aggressive future strategy';assert.equal(R.match(r,river(),{referenceAssumptions:a}).assumptionsMatch,false);});
test('invalid frequencies and impossible actions rejected',()=>{const r=reference();r.actions[0].frequency=.9;assert.throws(()=>R.parse(r),/sum to 1/);const x=reference();x.actions[1].kind='check';assert.throws(()=>R.parse(x),/illegal/);});
test('unsafe provenance URL rejected',()=>{const r=reference();r.source.url='javascript:alert(1)';assert.throws(()=>R.parse(r),/http/);});
test('missing source, incomplete ranges, nonnumeric EV rejected',()=>{const a=reference();delete a.source;assert.throws(()=>R.parse(a),/Source/);const b=reference();delete b.assumptions.ranges[1];assert.throws(()=>R.parse(b),/Range/);const c=reference();c.actions[0].ev='0';assert.throws(()=>R.parse(c),/expected value/);});
test('duplicate and board-blocked reference combos rejected',()=>{const a=reference();a.assumptions.ranges[0].push({cards:['Jc','Js'],weight:1});assert.throws(()=>R.parse(a),/twice/);const b=reference();b.assumptions.ranges[1]=[{cards:['Ac','Kd'],weight:1}];assert.throws(()=>R.parse(b),/board card/);});
test('future history rejected rather than tolerated',()=>{const a=reference();a.state.history.push({kind:'street',street:3,board:['3s','7d','4h','Ac','9s'],pot:a.state.pot});assert.throws(()=>R.parse(a),/future or inconsistent/);});
test('inconsistent pot and legal call rejected',()=>{const a=reference();a.state.pot++;assert.throws(()=>R.parse(a),/Pot must equal/);const b=reference();b.state.legal.call++;assert.throws(()=>R.parse(b),/Calling price/);});
test('source does not acquire verified status from submitted metadata',()=>{const a=reference();a.source.verification='Officially verified';assert.match(R.parse(a).source.verification,/not independently verified/);});
test('private metadata excluded from exported template',()=>{const d=river();d.view.opponents[0].hole=['Ad','Kd'];d.view.seed=12345;d.action.note='Private note';const t=R.template(d);assert.ok(!JSON.stringify(t.state).includes('Private note'));assert.equal(t.state.seed,undefined);assert.equal(t.state.opponents[0].hole,undefined);});
console.log(`${passed} reference tests passed.`);
