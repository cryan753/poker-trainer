/* River 90 tournament utility. Original implementation of the Independent Chip Model.
   Reference: https://blog.gtowizard.com/icm-basics/
   Equal skill, static stacks/payouts; no bounty, future blind or positional adjustment. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.Poker.Tournament=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const VERSION='3.0.0',cache=new Map(),MAX_PLAYERS=64,EXACT_LIMIT=10;
function rng(seed){let x=seed>>>0;return()=>{x+=0x6D2B79F5;let t=x;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function normalized(stacks,payouts){
 if(!Array.isArray(stacks)||stacks.length<1||stacks.length>MAX_PLAYERS)throw Error('ICM needs 1–64 remaining players, including other tables.');
 if(stacks.some(x=>!Number.isFinite(x)||x<0)||!stacks.some(x=>x>0))throw Error('ICM stacks must be finite and nonnegative, with chips in play.');
 if(!Array.isArray(payouts)||!payouts.length||payouts.length>stacks.length)throw Error('Enter the remaining payouts, largest first, with no more places than remaining players.');
 if(payouts.some(x=>!Number.isFinite(x)||x<0)||!payouts.some(x=>x>0)||payouts.reduce((a,b)=>a+b,0)>1e12)throw Error('Payouts must be finite and nonnegative, with a positive prize pool below one trillion units.');
 for(let i=1;i<payouts.length;i++)if(payouts[i]>payouts[i-1])throw Error('Enter payouts in finishing order, largest first. Equal satellite prizes are supported.');
 return [...payouts,...Array(stacks.length-payouts.length).fill(0)];
}
function validate(tournament,view){
 try{
  if(!tournament||typeof tournament!=='object')throw Error('Enter a payout schedule before enabling ICM.');
  const others=tournament.otherStacks||[];
  if(!Array.isArray(others)||others.some(x=>!Number.isFinite(x)||x<=0))throw Error('Other-table stacks must be positive amounts.');
  const seated=Array.from({length:view.n},(_,i)=>{const p=i===view.seat?view:view.opponents.find(x=>x.seat===i);if(!p)throw Error('A table stack is missing.');return p.stack+p.total;});
  const stacks=seated.concat(others),payouts=normalized(stacks,tournament.payouts);
  return {valid:true,payouts,otherStacks:others.slice(),players:stacks.length,method:stacks.length<=EXACT_LIMIT?'Exact ICM for supplied stacks':'Sampled ICM for supplied stacks',warnings:['Include every player still in the event. Unlisted finishing places pay zero.','ICM assumes equal skill and a fixed payout schedule; bounties and future blind increases are not modeled.']};
 }catch(e){return {valid:false,error:e.message,errors:[e.message]};}
}
function bustValue(stacks,hero,payouts,startStacks){
 const zeros=stacks.map((x,i)=>i).filter(i=>stacks[i]===0),alive=stacks.length-zeros.length;
 if(!Array.isArray(startStacks)||startStacks.length!==stacks.length||startStacks.some(x=>!Number.isFinite(x)||x<0))return payouts.slice(alive).reduce((a,b)=>a+b,0)/zeros.length;
 const above=zeros.filter(i=>startStacks[i]>startStacks[hero]).length,equal=zeros.filter(i=>startStacks[i]===startStacks[hero]).length;
 return payouts.slice(alive+above,alive+above+equal).reduce((a,b)=>a+b,0)/equal;
}
function exact(stacks,hero,payouts){
 const heroStack=stacks[hero],others=stacks.filter((_,i)=>i!==hero),n=others.length,size=1<<n,total=stacks.reduce((a,b)=>a+b,0),prob=new Float64Array(size),sums=new Float64Array(size),counts=new Uint8Array(size);prob[0]=1;
 let result=0;
 for(let mask=0;mask<size;mask++){
  if(mask){const bit=mask&-mask,previous=mask^bit,j=31-Math.clz32(bit);sums[mask]=sums[previous]+others[j];counts[mask]=counts[previous]+1;}
  const k=counts[mask];if(!prob[mask]||k>=payouts.length)continue;
  const remaining=total-sums[mask];result+=prob[mask]*heroStack/remaining*(payouts[k]||0);
  if(k+1>=payouts.length)continue;
  for(let j=0;j<n;j++)if(!(mask&(1<<j)))prob[mask|(1<<j)]+=prob[mask]*others[j]/remaining;
 }
 return result;
}
function details(stacks,hero,payouts,options={}){
 const prizes=normalized(stacks,payouts);if(!Number.isInteger(hero)||hero<0||hero>=stacks.length)throw Error('Invalid hero seat for ICM.');
 const samples=Math.max(64,Math.min(4096,Math.round(options.samples||256))),seed=Number.isFinite(options.seed)?options.seed>>>0:901903;
 const key=JSON.stringify([stacks,hero,prizes,options.startStacks||null,samples,seed]);if(cache.has(key))return {...cache.get(key)};
 let out;
 if(stacks[hero]===0)out={value:bustValue(stacks,hero,prizes,options.startStacks),se:0,method:'Elimination payout',samples:0};
 else{
  const indices=stacks.map((x,i)=>i).filter(i=>stacks[i]>0),live=indices.map(i=>stacks[i]),h=indices.indexOf(hero),pay=prizes.slice(0,live.length);
  if(live.length<=EXACT_LIMIT)out={value:exact(live,h,pay),se:0,method:'Exact ICM',samples:0};
  else{
   const random=rng(seed);let sum=0,squares=0;
   // Independent exponential arrivals generate the ICM finish-order distribution.
   // Reusing seeds across alternatives reduces numerical noise without using hidden cards.
   for(let s=0;s<samples;s++){
    let heroTime=0;const times=live.map((chips,i)=>{const x=-Math.log(Math.max(1e-12,random()))/chips;if(i===h)heroTime=x;return x;});
    const place=times.reduce((n,x,i)=>n+(i!==h&&x<heroTime?1:0),0),value=pay[place]||0;sum+=value;squares+=value*value;
   }
   const mean=sum/samples,variance=Math.max(0,(squares-sum*sum/samples)/(samples-1));out={value:mean,se:Math.sqrt(variance/samples),method:'Sampled ICM',samples};
  }
 }
 out.players=stacks.length;out.prizePool=prizes.reduce((a,b)=>a+b,0);
 if(cache.size>=1500)cache.clear();cache.set(key,out);return {...out};
}
function value(stacks,hero,payouts,options){return details(stacks,hero,payouts,options).value;}
return {version:VERSION,value,details,validate,exactLimit:EXACT_LIMIT,maxPlayers:MAX_PLAYERS};
});
