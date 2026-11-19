'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),T=require('../tournament.js');
function close(a,b,tol=1e-8){assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);}
function brute(stacks,payouts){const values=stacks.map(()=>0);function walk(left,prob,rank){if(!left.length)return;const sum=left.reduce((s,i)=>s+stacks[i],0);for(const i of left){const p=prob*stacks[i]/sum;values[i]+=p*(payouts[rank]||0);walk(left.filter(j=>j!==i),p,rank+1);}}walk(stacks.map((_,i)=>i),1,0);return values;}
test('ICM matches independent permutation enumeration',()=>{for(const stacks of [[500,300,200],[8,2,5,9,4]]){const pay=stacks.length===3?[500,300,200]:[90,40,20,0,0],expected=brute(stacks,pay);expected.forEach((x,i)=>close(T.value(stacks,i,pay),x));}});
test('Winner-take-all equals chip share',()=>{const stacks=[7,13,80];stacks.forEach((x,i)=>close(T.value(stacks,i,[1000]),x*10));});
test('Equal stacks share prizes equally and scale invariant',()=>{close(T.value([100,100,100],0,[60,30,10]),100/3);close(T.value([5,3,2],1,[500,300,200]),T.value([500,300,200],1,[500,300,200]));});
test('Tournament equity is conserved',()=>{const stacks=[150,95,220,35,80,100],pay=[400,200,100];close(stacks.reduce((s,_,i)=>s+T.value(stacks,i,pay),0),700);});
test('Busts receive earned remaining prizes; simultaneous ties split',()=>{close(T.value([100,0,0],1,[50,30,20],{startStacks:[50,30,20]}),30);close(T.value([100,0,0],2,[50,30,20],{startStacks:[50,30,20]}),20);close(T.value([100,0,0],1,[50,30,20],{startStacks:[60,20,20]}),25);close(T.value([100,0,0],0,[50,30,20]),50);});
test('Satellite payouts assign equal value when all survivors paid equally',()=>{for(let i=0;i<3;i++)close(T.value([10,90,3],i,[100,100,100]),100);});
test('Sampled large-field ICM is deterministic and labeled',()=>{const s=Array(12).fill(100),a=T.details(s,0,[120,60,30],{samples:4096,seed:19}),b=T.details(s,0,[120,60,30],{samples:4096,seed:19});assert.deepEqual(a,b);assert.equal(a.method,'Sampled ICM');assert.ok(Math.abs(a.value-210/12)<4*a.se);});
test('Reject invalid schedules instead of quietly switching metrics',()=>{assert.throws(()=>T.value([100,100],0,[20,50]),/largest/);assert.throws(()=>T.value([100,-1],0,[50]),/nonnegative/);assert.throws(()=>T.value([100,100],0,[50,30,20]),/places/);assert.throws(()=>T.value([0,0],0,[50]),/chips/);});
