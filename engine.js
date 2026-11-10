
/* River 90 Table Lab — original local no-limit hold'em engine. No external runtime. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.Poker=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const RANKS='23456789TJQKA',SUITS='cdhs',GLYPHS=['♣','♦','♥','♠'];
const STREETS=['Preflop','Flop','Turn','River'];
const PROFILES={
 'tight-passive':{name:'Tight-passive',short:'TP',loose:.19,aggr:.18,bluff:.025,call:.01,description:'Selective entries, frequent checks and calls, rare bluffs. Treat big raises with respect.'},
 'tight-aggressive':{name:'Tight-aggressive',short:'TAG',loose:.27,aggr:.66,bluff:.12,call:-.015,description:'Position-aware opening ranges, value raises, selective continuation bets and bluffs.'},
 'loose-aggressive':{name:'Loose-aggressive',short:'LAG',loose:.44,aggr:.82,bluff:.24,call:.035,description:'Wider entries, pressure bets and more bluffs. Not every aggressive action is weak.'},
 'calling-station':{name:'Calling station',short:'CS',loose:.63,aggr:.13,bluff:.015,call:.17,description:'Too many calls with pairs and draws; few raises or bluffs. Favor value over bluffs.'},
 'nit':{name:'Very tight',short:'NIT',loose:.12,aggr:.37,bluff:.015,call:-.055,description:'Very selective. Often releases marginal hands, but enters strong ranges.'},
 'maniac':{name:'Maniac',short:'MAN',loose:.77,aggr:.94,bluff:.39,call:.11,description:'Very wide, frequent raises and oversized bets. Expect high variance.'}
};
function rng(seed){let x=seed>>>0;return()=>{x+=0x6D2B79F5;let t=x;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function seedNew(){try{return crypto.getRandomValues(new Uint32Array(1))[0];}catch{return Math.floor(Math.random()*4294967296);}}
function card(code){if(typeof code==='number'&&Number.isInteger(code)&&code>=0&&code<52)return code;const s=String(code).trim().replace('10','T');const r=RANKS.indexOf(s[0]?.toUpperCase()),u=SUITS.indexOf(s[1]?.toLowerCase());if(s.length!==2||r<0||u<0)throw Error('Use cards such as As, Qh, Td, 7c.');return r*4+u;}
function rank(c){return Math.floor(c/4)+2;}
function suit(c){return c%4;}
function code(c){return RANKS[Math.floor(c/4)]+SUITS[c%4];}
function text(c){return RANKS[Math.floor(c/4)]+GLYPHS[c%4];}
function straight(rs){let set=new Set(rs);if(set.has(14))set.add(1);for(let hi=14;hi>=5;hi--)if([0,1,2,3,4].every(k=>set.has(hi-k)))return hi;return 0;}
function score(cat,ks){let v=cat;for(let i=0;i<5;i++)v=v*15+(ks[i]||0);return v;}
const LABELS=['High card','One pair','Two pair','Three of a kind','Straight','Flush','Full house','Four of a kind','Straight flush'];
function evaluate(cs){
 if(cs.length<5||cs.length>7)throw Error('Evaluation needs 5–7 cards.');
 const cnt=Array(15).fill(0),ss=[[],[],[],[]];for(const c of cs){cnt[rank(c)]++;ss[suit(c)].push(rank(c));}
 const rs=[];for(let r=14;r>=2;r--)if(cnt[r])rs.push(r);
 const fl=ss.find(s=>s.length>=5);let cat,ks;
 if(fl&&straight(fl)){cat=8;ks=[straight(fl)];}
 else if(rs.find(r=>cnt[r]===4)){let q=rs.find(r=>cnt[r]===4);cat=7;ks=[q,rs.find(r=>r!==q)];}
 else {const tr=rs.filter(r=>cnt[r]>=3),pa=rs.filter(r=>cnt[r]>=2);
  if(tr.length&&pa.some(r=>r!==tr[0])){cat=6;ks=[tr[0],pa.find(r=>r!==tr[0])];}
  else if(fl){cat=5;ks=fl.slice().sort((a,b)=>b-a).slice(0,5);}
  else if(straight(rs)){cat=4;ks=[straight(rs)];}
  else if(tr.length){cat=3;ks=[tr[0],...rs.filter(r=>r!==tr[0]).slice(0,2)];}
  else if(pa.length>=2){cat=2;ks=[pa[0],pa[1],rs.find(r=>r!==pa[0]&&r!==pa[1])];}
  else if(pa.length){cat=1;ks=[pa[0],...rs.filter(r=>r!==pa[0]).slice(0,3)];}
  else{cat=0;ks=rs.slice(0,5);}
 }
 return {category:cat,kickers:ks,value:score(cat,ks),label:LABELS[cat]};
}
function handKey(cs){let a=rank(cs[0]),b=rank(cs[1]);if(a<b)[a,b]=[b,a];return RANKS[a-2]+RANKS[b-2]+(a===b?'':suit(cs[0])===suit(cs[1])?'s':'o');}
function strength(cs){const a=Math.max(...cs.map(rank)),b=Math.min(...cs.map(rank)),su=suit(cs[0])===suit(cs[1]);if(a===b)return .47+(a-2)*.043;return Math.min(.97,.09+(a-2)*.023+(b-2)*.031+(su?.07:0)+(a-b===1?.035:a-b===2?.02:0)+(a===14?.035:0));}
function features(hole,board){
 if(board.length<3)return {made:'Starting hand',value:strength(hole),category:-1,draw:false,flushDraw:false,straightOutRanks:[],overpair:false,topPair:false,boardOnly:false};
 const all=[...hole,...board],ev=evaluate(all),br=board.map(rank),hr=hole.map(rank);let counts=[0,0,0,0];all.forEach(c=>counts[suit(c)]++);
 const fd=board.length<5&&counts.some((n,s)=>n===4&&hole.some(c=>suit(c)===s));
 const missing=[];if(board.length<5&&ev.category<4){for(let r=2;r<=14;r++)if(!all.some(c=>rank(c)===r)&&straight([...all.map(rank),r]))missing.push(r);}
 const overpair=hr[0]===hr[1]&&hr[0]>Math.max(...br),topPair=ev.category===1&&hr.includes(Math.max(...br))&&ev.kickers[0]===Math.max(...br);
 const boardPair=br.filter((r,i)=>br.indexOf(r)!==i),boardOnly=(ev.category===1&&boardPair.includes(ev.kickers[0])&&!hr.includes(ev.kickers[0]));
 let made=overpair?'Overpair':topPair?'Top pair':boardOnly?'Board pair / kicker hand':ev.label;
 if(fd)made+=' + flush draw';if(missing.length)made+=` + ${missing.length>=2?'straight draw':'gutshot'}`;
 let v=[.08,.39,.67,.77,.84,.89,.94,.98,1][ev.category];if(overpair)v=.67;if(topPair)v=.55;if(boardOnly)v=.13;
 return {made,value:v,category:ev.category,draw:fd||missing.length>0,flushDraw:fd,straightOutRanks:missing,overpair,topPair,boardOnly,ev};
}
function positions(n,button){
 const seq=n===2?['BTN/SB','BB']:n===3?['BTN','SB','BB']:n===4?['BTN','SB','BB','CO']:n===5?['BTN','SB','BB','HJ','CO']:n===6?['BTN','SB','BB','UTG','HJ','CO']:n===7?['BTN','SB','BB','UTG','LJ','HJ','CO']:n===8?['BTN','SB','BB','UTG','UTG+1','LJ','HJ','CO']:['BTN','SB','BB','UTG','UTG+1','MP','LJ','HJ','CO'];
 let labels=Array(n);for(let j=0;j<n;j++)labels[(button+j)%n]=seq[j];return labels;
}
function order(n,start){return Array.from({length:n},(_,k)=>(start+k)%n);}
function cleanConfig(input){
 const c=JSON.parse(JSON.stringify(input));if(!Array.isArray(c.players)||c.players.length<2||c.players.length>9)throw Error('Choose 2–9 seats.');
 c.bb=Math.round(c.bb||100);if(c.bb<2||c.bb>1e8)throw Error('Invalid big blind.');c.sb=Math.max(1,Math.round(c.bb/2));c.mode=c.mode==='tournament'?'tournament':'cash';c.button=((Math.round(c.button||0)%c.players.length)+c.players.length)%c.players.length;
 c.anteType=['none','each','bb'].includes(c.anteType)?c.anteType:'none';c.ante=Math.max(0,Math.round(c.ante||0));c.rakePct=c.mode==='cash'?Math.max(0,Math.min(10,Number(c.rakePct)||0)):0;c.rakeCap=Math.max(0,Math.round(c.rakeCap||0));
 let hero=0;c.players=c.players.map((p,i)=>{const stack=Math.round(p.stack);if(!Number.isFinite(stack)||stack<1||stack>1e9)throw Error('Every stack must be positive and within the supported limit.');if(p.hero)hero++;return {id:p.id??i,name:String(p.name||`Player ${i+1}`).slice(0,36),profile:PROFILES[p.profile]?p.profile:'tight-aggressive',hero:!!p.hero,stack};});if(hero!==1)throw Error('Exactly one player must be you.');
 return c;
}
class Hand{
 constructor(config,seed=seedNew(),fixed={}){
  this.config=cleanConfig(config);this.seed=seed>>>0;this.players=this.config.players.map(p=>({...p,start:p.stack,hole:[],bet:0,total:0,dead:0,folded:false,actedAt:null,lastAction:'',payout:0}));this.n=this.players.length;this.button=this.config.button;this.bb=this.config.bb;this.hero=this.players.findIndex(p=>p.hero);this.pos=positions(this.n,this.button);this.street=0;this.board=[];this.logs=[];this.decisions=[];this.done=false;this.currentBet=this.bb;this.lastFullRaise=this.bb;this.raiseCount=0;this.lastAggressor=null;this.fee=0;this.pots=[];this.turn=0;this.serial=0;
  this.fixed=JSON.parse(JSON.stringify(fixed));const seen=[];
  for(const p of this.players){const raw=fixed.holes?.[p.id];if(raw){if(raw.length!==2)throw Error('A hand requires two hole cards.');p.hole=raw.map(card);seen.push(...p.hole);}}
  const fixedBoard=(fixed.board||[]).map(card);if(fixedBoard.length>5)throw Error('At most five board cards.');seen.push(...fixedBoard);if(new Set(seen).size!==seen.length)throw Error('A card is used twice.');
  let deck=Array.from({length:52},(_,i)=>i).filter(c=>!seen.includes(c)),r=rng(this.seed);for(let i=deck.length-1;i>0;i--){let j=Math.floor(r()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
  for(const p of this.players)if(!p.hole.length)p.hole=[deck.pop(),deck.pop()];
  this.runout=fixedBoard.slice();while(this.runout.length<5)this.runout.push(deck.pop());this.deck=deck;
  const sb=this.n===2?this.button:(this.button+1)%this.n,bb=(sb+1)%this.n;this.sbSeat=sb;this.bbSeat=bb;
  // Big-blind ante uses blind-first priority in this simulator.
  this.post(sb,Math.min(this.config.sb,this.players[sb].stack),'Small blind',true);this.post(bb,Math.min(this.bb,this.players[bb].stack),'Big blind',true);
  if(this.config.anteType==='each')for(let i=0;i<this.n;i++)this.post(i,Math.min(this.config.ante,this.players[i].stack),'Ante',false);
  if(this.config.anteType==='bb')this.post(bb,Math.min(this.config.ante,this.players[bb].stack),'Big-blind ante',false);
  this.pending=order(this.n,this.n===2?this.button:(bb+1)%this.n).filter(i=>this.players[i].stack>0);this.settle();
 }
 post(i,amount,label,live){const p=this.players[i];p.stack-=amount;p.total+=amount;if(live)p.bet+=amount;else p.dead+=amount;this.logs.push({street:0,seat:i,name:p.name,kind:'post',label,amount,total:p.bet,pot:this.pot(),board:[]});}
 pot(){return this.players.reduce((s,p)=>s+p.total,0);}
 active(){return this.players.map((p,i)=>i).filter(i=>!this.players[i].folded);}
 able(){return this.active().filter(i=>this.players[i].stack>0);}
 legal(i=this.turn){
  const p=this.players[i],live=this.able(),call=Math.max(0,Math.min(p.stack,this.currentBet-p.bet));
  const reopened=p.actedAt===null||this.currentBet-p.actedAt>=this.lastFullRaise;
  const cap=p.bet+p.stack,min=this.currentBet===0?this.bb:this.currentBet+this.lastFullRaise;
  const canRaise=!this.done&&live.some(j=>j!==i)&&reopened&&cap>this.currentBet;
  return {call,check:call===0,fold:call>0,raise:canRaise,minRaise:Math.min(min,cap),fullMinRaise:min,maxRaise:cap,shortOnly:cap<min,reopened};
 }
 // This is the ONLY information sent to a bot or the review estimator.
 view(i=this.turn){const p=this.players[i],l=this.legal(i),active=this.active();return {seat:i,hero:i===this.hero,profile:p.profile,hole:p.hole.slice(),board:this.board.slice(),street:this.street,bb:this.bb,mode:this.config.mode,position:this.pos[i],button:this.button,n:this.n,stack:p.stack,bet:p.bet,total:p.total,dead:p.dead,pot:this.pot(),currentBet:this.currentBet,lastFullRaise:this.lastFullRaise,raiseCount:this.raiseCount,lastAggressor:this.lastAggressor,legal:l,active:active.length,opponents:this.players.map((q,j)=>({seat:j,id:q.id,name:q.name,profile:q.profile,position:this.pos[j],stack:q.stack,bet:q.bet,total:q.total,dead:q.dead,folded:q.folded,lastAction:q.lastAction})).filter(q=>q.seat!==i),history:this.logs.map(e=>({...e,board:e.board?.slice()})),seed:(this.seed^Math.imul(this.serial+1,7919)^i)>>>0};}
 act(kind,amount=0,note=''){
  if(this.done)throw Error('This hand is finished.');const i=this.turn,p=this.players[i],v=this.view(i),l=v.legal;let put=0,target=p.bet,full=false;
  if(kind==='fold'){if(!l.fold)throw Error('Check is free; folding is disabled.');p.folded=true;p.lastAction='Fold';}
  else if(kind==='check'){if(!l.check)throw Error('You must call, raise or fold.');p.lastAction='Check';}
  else if(kind==='call'){if(l.check)throw Error('There is no bet to call.');put=l.call;target=p.bet+put;p.lastAction=put===p.stack?'Call all-in':'Call';}
  else if(kind==='raise'){
   target=Math.round(Number(amount));if(!l.raise)throw Error('Betting is not open for a raise.');if(!Number.isFinite(target)||target<l.minRaise||target>l.maxRaise)throw Error('Raise total is outside the legal range.');
   put=target-p.bet;const increment=target-this.currentBet;full=increment>=this.lastFullRaise;if(full)this.lastFullRaise=increment;
   this.currentBet=target;this.raiseCount++;this.lastAggressor=i;p.lastAction=put===p.stack?'All-in':v.currentBet===0?'Bet':'Raise';
  }else throw Error('Unknown action.');
  if(put){p.stack-=put;p.bet+=put;p.total+=put;}
  p.actedAt=this.currentBet;
  const entry={street:this.street,seat:i,name:p.name,kind,label:p.lastAction,amount:put,total:p.bet,pot:this.pot(),board:this.board.slice(),allIn:p.stack===0,note:String(note||'').slice(0,1500)};
  if(i===this.hero)this.decisions.push({view:v,action:{kind,amount:put,total:p.bet,note:entry.note},event:this.logs.length});
  this.logs.push(entry);this.serial++;
  this.pending=this.pending.filter(j=>j!==i&&!this.players[j].folded&&this.players[j].stack>0);
  if(kind==='raise')this.pending=order(this.n,(i+1)%this.n).filter(j=>j!==i&&!this.players[j].folded&&this.players[j].stack>0&&(full||this.players[j].bet<this.currentBet));
  this.settle();return entry;
 }
 settle(){
  let guard=0;while(!this.done&&guard++<10){
   if(this.active().length===1){this.finish(false);return;}
   const able=this.able();
   if(able.length===0){this.runToRiver();return;}
   if(able.length===1){const i=able[0],target=Math.max(0,...this.active().filter(j=>j!==i).map(j=>this.players[j].bet));
    if(this.players[i].bet<target){this.currentBet=target;this.pending=[i];this.turn=i;return;}
    this.runToRiver();return;
   }
   this.pending=this.pending.filter(i=>!this.players[i].folded&&this.players[i].stack>0);
   if(this.pending.length){this.turn=this.pending[0];return;}
   this.returnUncalled();
   if(this.street===3){this.finish(true);return;}
   this.street++;this.board=this.runout.slice(0,this.street===1?3:this.street+2);this.currentBet=0;this.lastFullRaise=this.bb;this.raiseCount=0;this.lastAggressor=null;
   for(const p of this.players){p.bet=0;p.actedAt=null;p.lastAction=p.folded?'Fold':p.stack===0?'All-in':'';}
   this.logs.push({kind:'street',street:this.street,board:this.board.slice(),pot:this.pot()});this.pending=order(this.n,(this.button+1)%this.n).filter(i=>!this.players[i].folded&&this.players[i].stack>0);
  }
  if(guard>=10&&!this.done)throw Error('Betting round did not settle.');
 }
 returnUncalled(){const ranked=this.players.map((p,i)=>({i,total:p.bet})).sort((a,b)=>b.total-a.total);if(ranked[0].total>ranked[1].total){const x=ranked[0],amount=x.total-ranked[1].total,p=this.players[x.i];p.total-=amount;p.stack+=amount;p.bet=Math.max(0,p.bet-amount);this.logs.push({kind:'return',seat:x.i,name:p.name,amount,street:this.street,pot:this.pot(),board:this.board.slice()});}}
 runToRiver(){this.returnUncalled();while(this.street<3){this.street++;this.board=this.runout.slice(0,this.street===1?3:this.street+2);this.logs.push({kind:'street',street:this.street,board:this.board.slice(),pot:this.pot()});}this.finish(true);}
 finish(showdown){
  this.returnUncalled();this.done=true;this.showdown=showdown;this.finalPot=this.pot();this.fee=this.config.rakePct&&this.board.length>=3?Math.min(this.config.rakeCap,Math.floor(this.finalPot*this.config.rakePct/100)):0;
  const levels=[...new Set(this.players.map(p=>p.total-p.dead).filter(x=>x>0))].sort((a,b)=>a-b);let prev=0,rakeLeft=this.fee,dead=this.players.reduce((s,p)=>s+p.dead,0),layers=[];
  for(const level of levels){const contributing=this.players.map((p,i)=>i).filter(i=>this.players[i].total-this.players[i].dead>=level),eligible=prev===0?this.active():contributing.filter(i=>!this.players[i].folded);const gross=(level-prev)*contributing.length+(prev===0?dead:0);prev=level;
   if(!eligible.length)throw Error('No eligible player for a pot.');const last=layers[layers.length-1];if(last&&JSON.stringify(last.eligible)===JSON.stringify(eligible))last.gross+=gross;else layers.push({gross,eligible});
  }
  for(const layer of layers){const {gross,eligible}=layer,amount=gross-Math.min(gross,rakeLeft);rakeLeft-=gross-amount;let winners=eligible;
   if(showdown&&eligible.length>1){const vals=eligible.map(i=>evaluate([...this.players[i].hole,...this.board]).value),best=Math.max(...vals);winners=eligible.filter((_,k)=>vals[k]===best);}
   const each=Math.floor(amount/winners.length),odd=amount%winners.length,sorted=order(this.n,(this.button+1)%this.n).filter(i=>winners.includes(i));
   for(let k=0;k<sorted.length;k++){const award=each+(k<odd?1:0);this.players[sorted[k]].stack+=award;this.players[sorted[k]].payout+=award;}
   this.pots.push({gross,amount,eligible,winners});
  }
  this.winners=[...new Set(this.pots.flatMap(p=>p.winners))];this.net=this.players[this.hero].stack-this.players[this.hero].start;this.pending=[];
  this.logs.push({kind:'result',street:this.street,pot:this.finalPot,fee:this.fee,board:this.board.slice(),winners:this.winners});this.assert();
 }
 assert(){const initial=this.players.reduce((s,p)=>s+p.start,0),now=this.players.reduce((s,p)=>s+p.stack+(this.done?0:p.total),0)+(this.done?this.fee:0);if(initial!==now)throw Error(`Chip conservation failed: ${initial} vs ${now}`);if(this.players.some(p=>p.stack<0||p.total<0||!Number.isInteger(p.stack)))throw Error('Invalid chip count');const cards=[...this.players.flatMap(p=>p.hole),...this.runout];if(new Set(cards).size!==cards.length)throw Error('Duplicate cards');return true;}
}
function positionalFloor(pos,n){if(n===2)return .28;if(pos==='BTN')return .36;if(pos==='SB')return .40;if(pos==='CO')return .46;if(pos==='HJ')return .53;if(pos==='LJ'||pos==='MP')return .56;return .59;}
function inOpeningRange(hole,pos,n){
 const a=Math.max(...hole.map(rank)),b=Math.min(...hole.map(rank)),su=suit(hole[0])===suit(hole[1]);
 if(n===2)return a===14||a===b||su||a>=12||a-b<=2&&a>=7;
 const tier=pos==='BTN'?3:pos==='SB'?3:pos==='CO'?2:pos==='HJ'?1:0;
 if(a===b)return a>=[6,5,3,2][tier];
 if(su){if(a===14)return b>=[10,8,2,2][tier];if(a===13)return b>=[11,10,8,2][tier];if(a===12)return b>=[10,10,9,5][tier];if(a===11)return b>=[10,9,9,7][tier];return a-b<=1&&b>=[8,7,5,3][tier]||tier>=2&&a-b===2&&a>=8||tier===3&&a-b===3&&a>=9;}
 if(a===14)return b>=[11,10,9,2][tier];if(a===13)return b>=[12,11,10,8][tier];if(a===12)return b>=[12,11,10,9][tier];if(a===11)return b>=[12,12,10,9][tier];return tier===3&&a>=9&&a-b===1;
}
function rangeWeight(cs,opp,view){
 const p=PROFILES[opp.profile]||PROFILES['tight-aggressive'],s=strength(cs);let base=positionalFloor(opp.position,view.n)+(.27-p.loose)*.45;
 const acts=view.history.filter(e=>e.seat===opp.seat&&['raise','call','check'].includes(e.kind));let w=1;
 for(const a of acts){
  if(a.street===0){let threshold=base;if(a.kind==='raise')threshold+=a.total>view.bb*5?.14:.03;if(a.kind==='call')threshold-=p.call+.03;
   if(a.kind!=='check')w*=.035+.965/(1+Math.exp(-(s-threshold)*17));
  }else{const f=features(cs,a.board),v=f.value+(f.draw?.19:0),isRaise=a.kind==='raise';let t=isRaise?.49:.31;
   if(isRaise&&p.aggr<.3)t=.69;if(a.amount/Math.max(1,a.pot-a.amount)>.7)t+=.06;
   t-=p.call;const bluff=isRaise?p.bluff:.025;w*=a.kind==='check'?.92:(bluff+(1-bluff)/(1+Math.exp(-(v-t)*12)));
  }
 }
 if(!acts.length)w=.10+.90/(1+Math.exp(-(s-(base-.12))*11));return Math.max(.004,w);
}
function equity(view,iterations=500){
 const opponents=view.opponents.filter(o=>!o.folded),known=new Set([...view.hole,...view.board]),available=Array.from({length:52},(_,i)=>i).filter(c=>!known.has(c));if(!opponents.length)return 1;
 const random=rng(view.seed^0x41ab39),pool=opponents.map(o=>{const combos=[],weights=[];let total=0;for(let a=0;a<available.length-1;a++)for(let b=a+1;b<available.length;b++){const c=[available[a],available[b]],w=rangeWeight(c,o,view);total+=w;combos.push(c);weights.push(total);}return {combos,weights,total};});
 function sample(k,used){const p=pool[k];for(let attempts=0;attempts<150;attempts++){let x=random()*p.total,lo=0,hi=p.weights.length-1;while(lo<hi){let m=(lo+hi)>>1;if(p.weights[m]<x)lo=m+1;else hi=m;}const c=p.combos[lo];if(!used.has(c[0])&&!used.has(c[1]))return c;}let left=available.filter(c=>!used.has(c));const a=left.splice(Math.floor(random()*left.length),1)[0],b=left[Math.floor(random()*left.length)];return [a,b];}
 let points=0;for(let t=0;t<iterations;t++){const used=new Set(known),hands=[];for(let k=0;k<opponents.length;k++){const h=sample(k,used);h.forEach(c=>used.add(c));hands.push(h);}let board=view.board.slice(),left=available.filter(c=>!used.has(c));while(board.length<5){const j=Math.floor(random()*left.length);board.push(left[j]);left[j]=left[left.length-1];left.pop();}
  const val=evaluate([...view.hole,...board]).value;let ties=1,lose=false;for(const h of hands){let z=evaluate([...h,...board]).value;if(z>val){lose=true;break;}if(z===val)ties++;}if(!lose)points+=1/ties;
 }return points/iterations;
}
function bot(view){
 const p=PROFILES[view.profile]||PROFILES['tight-aggressive'],r=rng(view.seed^0x105C9),s=strength(view.hole),l=view.legal,bb=view.bb;let action;
 const betTo=(target)=>({kind:'raise',amount:Math.max(l.minRaise,Math.min(l.maxRaise,Math.round(target)))});
 if(view.street===0){
  let threshold=positionalFloor(view.position,view.n)+(.27-p.loose)*.46;const limpers=view.history.filter(e=>e.street===0&&e.kind==='call'&&e.total===bb).length;
  if(view.currentBet<=bb){if(s>=threshold&&r()<(p.aggr>.35?.96:p.aggr+.12)&&l.raise){let size=(view.mode==='tournament'?2.2:2.6)+limpers*.9;if(view.stack/bb<13&&(s>threshold+.06||r()<.35))return betTo(l.maxRaise);return betTo(size*bb);}
   if(l.check)return{kind:'check'};if(s>=threshold-.08-p.call||r()<p.loose*.10)return{kind:'call'};return{kind:'fold'};
  }
  const size=view.currentBet/bb;threshold+=Math.min(.30,Math.log2(Math.max(1,size/2.5))*.10)+.025;
  if(l.raise&&(((s>.83||Math.min(...view.hole.map(rank))>=13)&&r()<p.aggr)||(r()<p.bluff*.15&&view.raiseCount<3))){let target=view.currentBet*(view.position==='BTN'?3:3.8);if(target>view.stack*.6||view.stack<bb*15)target=l.maxRaise;return betTo(target);}
  const pressure=l.call/Math.max(1,view.stack);if(s>=threshold-p.call-pressure*.15|| (l.call<bb*.5&&s>threshold-.18))return{kind:'call'};return{kind:'fold'};
 }
 const f=features(view.hole,view.board),eq=equity(view,95),need=l.call/(view.pot+l.call),multi=view.active>2;
 if(l.check){const value=eq>(multi?.56:.60)&&!f.boardOnly,semi=f.draw&&view.street<3;
  let chance=value?p.aggr+.18:semi?p.aggr*.57:p.bluff*(multi?.40:1);
  if(l.raise&&r()<chance){let frac=value?(p.aggr>.8?.85:.65):semi?.55:.45;if(p.name==='Maniac'&&r()<.25)frac=1.3;let total=Math.max(bb,view.pot*frac);if(total>view.stack*.70&&value)total=l.maxRaise;return betTo(total);}
  return{kind:'check'};
 }
 if(l.raise&&((eq>.77&&r()<p.aggr*.85)||(f.draw&&r()<p.bluff*.65)||(r()<p.bluff*.13&&!multi))){let target=view.currentBet+Math.max(view.currentBet*2,view.pot*.65);if(target>view.stack*.7)target=l.maxRaise;return betTo(target);}
 const fee=view.mode==='cash'?.015:0,realize=view.street<3?.045:0;const threshold=need+fee+realize-p.call+(multi?.02:0);
 if(eq>=threshold||r()<p.loose*.025)return{kind:'call'};return{kind:'fold'};
}
function contestedPot(view){const cap=view.total-view.dead+view.legal.call;return view.total+view.opponents.reduce((s,o)=>s+o.dead+Math.min(o.total-o.dead,cap),0);}
function reviewDecision(d){const v=d.view,a=d.action,l=v.legal,f=features(v.hole,v.board),bb=v.bb,ratio=a.amount/Math.max(1,v.pot),eff=Math.min(v.stack,...v.opponents.filter(o=>!o.folded&&o.stack>0).map(o=>o.stack)),notes=[];let status='Context matters',suggestion='Compare this choice with the alternatives.';
 const add=(title,body,level='context')=>{notes.push({title,body,level});if(level==='review')status='Review this';else if(level==='good'&&status!=='Review this')status='Sound baseline';};
 const opps=v.opponents.filter(o=>!o.folded),station=opps.some(o=>o.profile==='calling-station'),passive=opps.some(o=>['tight-passive','nit','calling-station'].includes(o.profile));
 const iso=v.history.filter(e=>e.street===0&&e.kind==='call'&&e.total===bb).length,unopened=v.currentBet<=bb&&iso===0;
 const eq=equity(v,650),contest=contestedPot(v),need=l.call?l.call/(contest+l.call):0;
 if(v.street===0){const open=inOpeningRange(v.hole,v.position,v.n),s=strength(v.hole);
  if(unopened&&a.kind==='fold'&&open&&!v.position.includes('SB')){add('Missed opening opportunity',`${handKey(v.hole)} falls inside this trainer’s simplified ${v.position} opening baseline. Consider raising first in, rather than treating it like a hand facing a raise.`,'review');suggestion='Consider an open to 2–3 big blinds.';}
  else if(unopened&&a.kind==='call'&&!v.position.includes('SB')){add('Open-limping',`From ${v.position}, use a raise-or-fold baseline. Limping gives the players behind a cheap entry. This is a beginner default, not a claim that limping is never optimal.`,'review');suggestion=open?'Prefer raising first in.':'Prefer folding this early-position entry.';}
  else if(unopened&&a.kind==='raise'&&!open&&v.stack/bb>20){add('Position before suitedness',`${handKey(v.hole)} is outside this trainer’s simplified ${v.position} opening range. Suited cards alone do not justify entering an early-position pot.`,'review');suggestion='Review the entry range for this position.';}
  else if(unopened&&((open&&a.kind==='raise')||(!open&&a.kind==='fold'))){add('Position-aware entry','Your decision is consistent with the trainer’s simplified opening baseline. Opponents, antes and rake can change the boundary.','good');suggestion='Keep this position-first process.';}
  if(a.kind==='raise'&&iso&&v.currentBet<=bb&&a.total<bb*(v.position==='SB'||v.position==='BB'?4.5:3.5)&&v.stack/bb>25){add('Small isolation raise','There is a limper. A practical starting point is about 4 big blinds in position or 5 out of position against one limper, adjusted for stacks and tendencies. A small raise makes calls cheap.','review');suggestion='Try a larger isolation size with hands worth raising.';}
  if(a.kind==='raise'&&v.currentBet>bb&&a.total<v.currentBet*2.6&&v.stack/bb>35){add('Small three-bet / reraise','This reraise gives the opener a cheap continuation. Consider roughly 3× in position and 3.5–4× out of position, with adjustments for callers and stacks. It is not a mandatory sizing rule.','review');suggestion='Compare a larger reraise.';}
  if(a.kind==='call'&&v.currentBet>bb&&(s>.82||Math.max(...v.hole.map(rank))===14&&Math.min(...v.hole.map(rank))>=12)&&v.raiseCount<2&&l.raise){add('Premium value opportunity','With this strong starting hand, compare a value reraise against simply calling. Keep the opener’s position and profile in mind.');suggestion='Consider reraising for value.';}
  if(a.kind==='raise'&&a.total/bb>35&&v.currentBet/bb<4&&s<.87){add('Large preflop commitment','This puts a deep stack at risk in a small pot. Identify which worse hands call and whether a smaller raise achieves your purpose.','review');}
 }else{
  const turnOver=v.street===2&&rank(v.hole[0])===rank(v.hole[1])&&v.board.slice(0,3).every(c=>rank(c)<rank(v.hole[0]))&&rank(v.board[3])>rank(v.hole[0]);
  if(a.kind==='raise'&&turnOver&&ratio>=.60){add('Reassess the overcard','Your flop overpair is now below the turn’s highest card. A large second barrel can fold out weaker pairs while stronger hands continue. Checking and reassessing is a useful baseline.','review');suggestion='Consider checking this turn.';}
  if(a.kind==='raise'&&station&&f.category<=1&&!f.topPair&&!f.overpair&&!f.draw&&eq<.45){add('Bluffing a calling station','This opponent model calls too widely. Identify a credible better hand that folds; otherwise favor checking and save aggression for value.','review');suggestion='Reduce low-equity bluffs into sticky ranges.';}
  if(a.kind==='raise'&&v.active>2&&f.category===0&&!f.draw&&ratio>.5){add('Multiway bluff risk','Several ranges must fold. This is a low-equity bluff without a direct draw; choose multiway bluffs selectively.','review');}
  if(a.kind==='check'&&(f.topPair||f.overpair)&&station&&eq>.70&&v.street===3){add('Possible missed thin value','A calling-station model can pay with weaker pairs. Compare a modest value bet with checking; board texture and the prior action still matter.');suggestion='Name the worse hands that could call a value bet.';}
  if(a.kind==='raise'&&f.value>.65&&eq>.65){add('Value-building candidate','Your made hand is strong against the approximate continuing ranges. Base the size on worse hands that can pay, not on the wish to avoid being outdrawn.','good');suggestion='Keep naming the worse calling hands.';}
  if(a.kind==='call'&&eq+0.10<need){add('Price versus realistic equity','The range estimate falls well short of the calling price. Review dirty outs, dominated pairs and whether implied odds are realistic. The estimate is not a solver verdict.','review');suggestion='Consider folding unless your opponent read or future payoff changes the calculation.';}
  else if(a.kind==='fold'&&eq>need+.18&&l.call/v.stack<.45){add('Potentially tight fold','The approximate range model gives materially more equity than the immediate price. Revisit this fold, but remember future betting and equity realization can still matter.');suggestion='Compare calling and the river plan.';}
  if(a.kind==='check'&&(f.topPair||f.overpair)&&eq>.65&&!station){add('Compare a value bet with the check','This model leaves you ahead of a meaningful part of the opponent range. Compare checking with a modest bet, around 40–65% of the pot, only if you can name weaker hands that continue.');suggestion='Ask which worse pairs or draws can pay you.';}
  if(a.kind==='call'&&eq>need+.08&&(f.value>.45||v.street===3)){add('The price supports continuing in this model','Your approximate equity exceeds the immediate calling threshold. The margin makes continuing plausible; on earlier streets, account for position and the cost of future bets.','good');if(status!=='Review this')suggestion='Calling is a plausible baseline; plan for the next street.';}
  if(a.kind==='fold'&&eq+.06<need&&!f.draw){add('Price discipline','The approximate range model gives less equity than the calling price. Folding is a reasonable baseline without a stronger opponent-specific read.','good');suggestion='Keep separating pot odds from money already invested.';}
  if(a.kind==='call'&&passive&&l.call/Math.max(1,v.stack)>.5&&f.category<=1){add('Passive aggression deserves attention','A passive player’s large aggressive action can represent a much stronger range than their ordinary calling range. A cheap-looking final call is not automatically required.');}
 }
 if(status==='Review this'&&suggestion.startsWith('Calling'))suggestion='Revisit the flagged decision before choosing a default.';
 if(!notes.length)add('A process check',a.kind==='fold'?'A fold is not judged by the cards that would have come. Compare the price with a plausible range before choosing to continue.':a.kind==='check'?'Checking keeps weaker hands and bluffs in the pot. Make sure you also have a plan for the next bet.':a.kind==='call'?'Calling needs a price, a plausible range, and a plan for future streets. Equity alone does not guarantee that you realize it.':'Before betting, identify worse hands that call or better hands that fold. The result does not validate the bet.');
 if(v.mode==='tournament')add('Tournament scope','This review measures chips and uses stack-depth heuristics. It does not solve payout pressure, ICM, satellites, bounties or multi-table dynamics.');
 return {status,suggestion,notes,equity:eq,need,contestedPot:contest,hand:f.made,iterations:650};
}
function review(hand){if(!hand.done)throw Error('Finish the hand before analysis.');return hand.decisions.map(d=>({...d,review:reviewDecision(d)}));}
function exportHand(h){return JSON.parse(JSON.stringify({version:1,seed:h.seed,config:h.config,fixed:h.fixed,players:h.players,board:h.board,logs:h.logs,decisions:h.decisions,net:h.net,finalPot:h.finalPot,fee:h.fee,pots:h.pots,button:h.button,pos:h.pos,bb:h.bb,hero:h.hero,showdown:h.showdown,winners:h.winners,done:h.done}));}
return {Hand,PROFILES,STREETS,RANKS,SUITS,GLYPHS,card,code,text,rank,suit,evaluate,features,handKey,strength,positions,rng,seedNew,bot,equity,review,reviewDecision,exportHand,inOpeningRange,cleanConfig};
});

