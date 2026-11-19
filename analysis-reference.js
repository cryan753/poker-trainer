/* River 90 references. Independently checkable arithmetic and strictly matched,
   user-supplied solver exports. This module contains no commercial solver library. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./engine.js'));
  else root.Poker.Reference=factory(root.Poker);
})(typeof globalThis!=='undefined'?globalThis:this,function(P){
'use strict';
const VERSION='1.0.0',FORMAT='river90-reference-v1';
const SOURCES=[
  {title:'Expected value and pot odds',url:'https://blog.gtowizard.com/what-is-expected-value-in-poker/'},
  {title:'Why future betting changes equity realization',url:'https://blog.gtowizard.com/equity-realization/'},
  {title:'Solver betting trees',url:'https://piosolver.com/docs/viewer/postflop_tree_building/'},
  {title:'Opponent strategy assumptions',url:'https://piosolver.com/docs/viewer/node_locking/'}
];
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function fail(message){throw Error(message);}
function obj(x,label){if(!x||typeof x!=='object'||Array.isArray(x))fail(label+' must be an object.');return x;}
function num(x,label,min=0,max=1e12){if(typeof x!=='number'||!Number.isFinite(x)||x<min||x>max)fail(label+' must be a finite number from '+min+' to '+max+'.');return x;}
function integer(x,label,min=0,max=1e12){num(x,label,min,max);if(!Number.isInteger(x))fail(label+' must be a whole number.');return x;}
function str(x,label,max=2000){if(typeof x!=='string'||!x.trim()||x.length>max)fail(label+' must be nonempty text of at most '+max+' characters.');return x.trim();}
function arr(x,label,min=0,max=10000){if(!Array.isArray(x)||x.length<min||x.length>max)fail(label+' must contain '+min+'–'+max+' items.');return x;}
function bool(x,label){if(typeof x!=='boolean')fail(label+' must be true or false.');return x;}
function cards(x,label,count){const a=arr(x,label,count??0,count??7).map(P.card);if(new Set(a).size!==a.length)fail(label+' contains a duplicate card.');return a;}
function stable(x){if(Array.isArray(x))return '['+x.map(stable).join(',')+']';if(x&&typeof x==='object')return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}';return JSON.stringify(x);}
function hash(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16).padStart(8,'0');}
function ratio(pot,call){num(pot,'Current pot');num(call,'Call amount');if(pot+call===0)return 0;return call/(pot+call);}
function terminalCall(input){
  obj(input,'Call calculation');const pot=num(input.pot,'Current pot'),call=num(input.call,'Call amount'),q=num(input.equity,'Equity',0,1);
  const pct=num(input.rakePct??0,'Rake percentage',0,100),cap=num(input.rakeCap??1e12,'Rake cap'),finalPot=pot+call;
  let rake=Math.min(cap,finalPot*pct/100);if(input.integerRake)rake=Math.floor(rake);
  const available=finalPot-rake;return {finalPot,rake,available,requiredEquity:available?call/available:call?Infinity:0,callEV:q*available-call,foldEV:0};
}
function pureBluff(pot,bet,foldFrequency){
  num(pot,'Pot');num(bet,'Bet');num(foldFrequency,'Fold frequency',0,1);
  return {requiredFolds:pot+bet?bet/(pot+bet):0,ev:foldFrequency*pot-(1-foldFrequency)*bet};
}
function equityExact(hero,board,range){
  hero=cards(hero,'Hero cards',2);board=cards(board,'Board');if(board.length<3||board.length>5)fail('Exact reference equity supports flop, turn, and river.');
  const known=[...hero,...board];if(new Set(known).size!==known.length)fail('Hero and board contain duplicate cards.');
  range=arr(range,'Opponent range',1,1326);let points=0,mass=0,deals=0;
  for(const entry of range){obj(entry,'Range entry');const h=cards(entry.cards,'Opponent cards',2),w=num(entry.weight,'Combo weight',0,1e9);if(!w)continue;
    if(h.some(c=>known.includes(c)))fail('Opponent range contains a card already held by hero or on the board.');
    const used=new Set([...known,...h]),deck=Array.from({length:52},(_,i)=>i).filter(c=>!used.has(c));let score=0,n=0;
    const evaluate=extra=>{const b=[...board,...extra],a=P.evaluate([...hero,...b]).value,z=P.evaluate([...h,...b]).value;score+=a>z?1:a===z?.5:0;n++;};
    if(board.length===5)evaluate([]);else if(board.length===4)for(const c of deck)evaluate([c]);else for(let i=0;i<deck.length-1;i++)for(let j=i+1;j<deck.length;j++)evaluate([deck[i],deck[j]]);
    points+=w*score/n;mass+=w;deals+=n;
  }
  if(!mass)fail('Opponent range must have positive weight.');return {equity:points/mass,deals,method:'Exact enumeration under the supplied range'};
}
// One-street polar toy game: bettor has only unbeatable value or zero-equity air;
// defender has a pure bluff-catcher, with one fixed bet size and no raises.
// This is an analytic equilibrium of that restricted game, not a NLHE solution.
function toyRiver(input={}){
  const pot=num(input.pot??100,'Pot',1e-9),bet=num(input.bet??100,'Bet',1e-9),v=num(input.valueFraction??.5,'Value fraction',1e-9,1-1e-9);
  const desiredBluffPerValue=bet/(pot+bet),airBet=Math.min(1,v*desiredBluffPerValue/(1-v));
  const valueHeavy=airBet===1&&v>(pot+bet)/(pot+2*bet),call=valueHeavy?0:pot/(pot+bet);
  const bettingMass=v+(1-v)*airBet,bluffsAmongBets=(1-v)*airBet/bettingMass;
  const airEV=(1-call)*pot-call*bet,valueEV=pot+call*bet,defenderCallEV=bluffsAmongBets*(pot+bet)-(1-bluffsAmongBets)*bet;
  return {title:'Solved polar river toy game',pot,bet,valueFraction:v,valueBetFrequency:1,airBetFrequency:airBet,defenderCallFrequency:call,bluffsAmongBets,airBetEV:airEV,valueBetEV:valueEV,defenderCallEV,bettorEV:v*valueEV+(1-v)*airBet*airEV,
    scope:'Only nuts versus air against a bluff-catcher, one bet size, no raises, no rake. It is a mathematical reference, not a solution for your full poker hand.',
    explanation:valueHeavy?'The bettor has too few bluffs to make a call profitable. All available air bets; the defender folds.':'The bluff rate makes calling indifferent; the calling rate makes bluffing indifferent. Strong hands always bet.'};
}
function normalizePlayer(p,label,n){obj(p,label);return {seat:integer(p.seat,label+' seat',0,n-1),position:str(p.position,label+' position',20),stack:integer(p.stack,label+' stack'),bet:integer(p.bet,label+' street contribution'),total:integer(p.total,label+' total contribution'),dead:integer(p.dead??0,label+' dead money'),folded:bool(p.folded??false,label+' folded'),profile:String(p.profile||'unspecified').slice(0,100)};}
function canonicalState(decision){
  const v=obj(decision?.view||decision,'Decision snapshot'),n=integer(v.n,'Player count',2,9),seat=integer(v.seat,'Hero seat',0,n-1),street=integer(v.street,'Street',0,3),hole=cards(v.hole,'Hero cards',2).sort((a,b)=>a-b),board=cards(v.board,'Board',[0,3,4,5][street]);
  if(new Set([...hole,...board]).size!==hole.length+board.length)fail('A hero card is repeated on the board.');
  const opponents=arr(v.opponents,'Opponents',n-1,n-1).map(o=>normalizePlayer(o,'Opponent',n)).sort((a,b)=>a.seat-b.seat);
  if(new Set([seat,...opponents.map(o=>o.seat)]).size!==n)fail('Every seat must appear exactly once.');
  const hero=normalizePlayer({...v,folded:false},'Hero',n),legal=obj(v.legal,'Legal actions'),legalKeys=['check','fold','raise','shortOnly','reopened'],l={call:integer(legal.call,'Call amount'),minRaise:integer(legal.minRaise,'Minimum raise'),maxRaise:integer(legal.maxRaise,'Maximum raise'),fullMinRaise:integer(legal.fullMinRaise??legal.minRaise,'Full minimum raise')};
  legalKeys.forEach(k=>l[k]=bool(legal[k],k));
  const players=[hero,...opponents],pot=integer(v.pot,'Pot'),currentBet=integer(v.currentBet,'Current bet');
  if(players.reduce((sum,p)=>sum+p.total,0)!==pot)fail('Pot must equal all player contributions.');
  if(players.some(p=>p.dead>p.total||p.bet>p.total-p.dead||p.bet>currentBet))fail('Player contributions are inconsistent with the current bet.');
  if(l.call!==Math.max(0,Math.min(hero.stack,currentBet-hero.bet))||l.check!==(l.call===0)||l.fold!==(l.call>0))fail('Calling price and legal actions are inconsistent.');
  if(l.maxRaise!==hero.bet+hero.stack||l.minRaise>l.maxRaise)fail('Legal raise sizes are inconsistent with the hero stack.');
  const history=arr(v.history,'Action history',0,500).filter(e=>['post','raise','call','check','fold','street','return'].includes(e.kind)).map(e=>{
    const out={kind:e.kind,street:integer(e.street,'History street',0,3),board:cards(e.board||[],'History board')};
    if(out.street>street||out.board.some((c,i)=>board[i]!==c))fail('Reference history contains a future or inconsistent board.');
    if(e.kind!=='street'){out.seat=integer(e.seat,'History seat',0,n-1);out.amount=integer(e.amount??0,'History amount');out.total=integer(e.total??0,'History total');}
    if(own(e,'pot'))out.pot=integer(e.pot,'History pot');if(own(e,'allIn'))out.allIn=!!e.allIn;return out;
  });
  const pending=Array.isArray(v.pending)?v.pending.map(x=>integer(x,'Pending seat',0,n-1)):null;
  const actedAt=Array.isArray(v.actedAt)?v.actedAt.map(x=>x===null?null:integer(x,'Last acted bet')):null;
  if(actedAt&&actedAt.length!==n)fail('actedAt must contain every seat.');
  return {game:'NLHE',mode:v.mode==='tournament'?'tournament':'cash',street,bb:integer(v.bb,'Big blind',1),button:integer(v.button,'Button',0,n-1),seat,n,hole,board,hero,opponents,
    pot,currentBet,lastFullRaise:integer(v.lastFullRaise,'Last full raise',1),raiseCount:integer(v.raiseCount??0,'Raise count'),lastAggressor:v.lastAggressor==null?null:integer(v.lastAggressor,'Last aggressor',0,n-1),legal:l,pending,actedAt,history};
}
function stateAsView(s){return {...s,...s.hero,hole:s.hole,board:s.board,opponents:s.opponents};}
function rules(options={}){
  const r={rakePct:num(Number(options.rakePct||0),'Rake percentage',0,100),rakeCap:num(Number(options.rakeCap||0),'Rake cap'),noFlopNoDrop:true,tournament:null};
  if(options.tournament?.payouts?.length)r.tournament={payouts:arr(options.tournament.payouts,'Payouts',1,200).map((x,i)=>num(x,'Payout '+(i+1))),otherStacks:arr(options.tournament.otherStacks||[],'Other-table stacks',0,200).map((x,i)=>num(x,'Other stack '+(i+1),1))};
  return r;
}
function normalizeAssumptions(a,state){
  obj(a,'Assumptions');if(!['equilibrium','fixed-policy'].includes(a.solutionType))fail('assumptions.solutionType must be equilibrium or fixed-policy.');
  const input=obj(a.ranges,'Explicit weighted ranges'),ranges={},board=new Set(state.board),seats=[state.seat,...state.opponents.filter(o=>!o.folded).map(o=>o.seat)].sort((x,y)=>x-y);
  for(const seat of seats){const entries=arr(input[String(seat)],'Range for seat '+seat,1,1326),seen=new Set();let mass=0;
    ranges[seat]=entries.map(e=>{obj(e,'Range combination');const c=cards(e.cards,'Range cards',2).sort((x,y)=>x-y),w=num(e.weight,'Range weight',0,1e9);if(c.some(x=>board.has(x)))fail('A reference range uses a board card.');const k=c.join('-');if(seen.has(k))fail('A range lists a combination twice.');seen.add(k);mass+=w;return {cards:c,weight:w};}).filter(e=>e.weight>0).sort((a,b)=>a.cards[0]-b.cards[0]||a.cards[1]-b.cards[1]);
    if(!mass)fail('Every reference range needs positive weight.');
    // Avoid renormalizing a parsed probability vector on every load: floating
    // round-off otherwise changes its fingerprint and prevents an exact match.
    if(Math.abs(mass-1)>1e-10)ranges[seat].forEach(e=>e.weight/=mass);
  }
  const tree=obj(a.tree,'Betting tree');return {solutionType:a.solutionType,ranges,tree:{description:str(tree.description,'Betting-tree description',10000)},continuation:str(a.continuation,'Continuation strategy description',10000)};
}
function actionLabel(a,state){const bb=n=>(n/state.bb).toLocaleString('en-US',{maximumFractionDigits:2})+' BB';if(a.kind==='raise')return (state.currentBet?'Raise to ':'Bet ')+bb(a.total);if(a.kind==='call')return 'Call '+bb(state.legal.call);return a.kind==='check'?'Check':'Fold';}
function normalizeActions(actions,state){
  const l=state.legal,seen=new Set();return arr(actions,'Action EVs',1,40).map(a=>{
    obj(a,'Action');if(!['check','fold','call','raise'].includes(a.kind))fail('Unknown reference action.');let total=integer(a.total,'Action street total');
    if(a.kind==='check'&&(!l.check||total!==state.hero.bet)||a.kind==='fold'&&(!l.fold||total!==state.hero.bet)||a.kind==='call'&&(l.check||total!==state.hero.bet+l.call)||a.kind==='raise'&&(!l.raise||total<l.minRaise||total>l.maxRaise))fail('Reference action is illegal for this snapshot: '+a.kind+'.');
    const key=a.kind+':'+total;if(seen.has(key))fail('Duplicate reference action.');seen.add(key);
    return {kind:a.kind,total,ev:num(a.ev,'Action expected value',-1e12,1e12),frequency:a.frequency==null?null:num(a.frequency,'Action frequency',0,1),label:actionLabel(a,state)};
  });
}
function template(decision,options={}){
  const state=canonicalState(decision),r=rules(options),a=decision.action||{kind:state.legal.check?'check':'call',total:state.hero.bet+state.legal.call};
  return {format:FORMAT,title:'Replace with the name of your solved scenario',source:{tool:'Enter solver or independent analysis source',version:'Enter tool version',url:'',notes:'User-supplied reference. Parsing does not verify that the source or EVs are correct.'},state,rules:r,
    assumptions:{solutionType:'equilibrium',ranges:Object.fromEntries([state.seat,...state.opponents.filter(o=>!o.folded).map(o=>o.seat)].map(s=>[s,[]])),tree:{description:'Describe every available size, raise cap, and remaining betting street.'},continuation:'Describe equilibrium or the locked continuation strategies used.'},
    unit:r.tournament?'prize units':'BB',evConvention:'net-from-decision',actions:[{kind:a.kind,total:a.total??(state.hero.bet+(a.amount||0)),ev:null,frequency:null}],instructions:'Fill the explicit weighted ranges for all live players, source, betting-tree assumptions, and numeric EVs for every action you want compared. Convert chip EVs to big blinds and use net-from-decision accounting (previous contributions are sunk). For tournament values use the supplied payout units. This template is intentionally invalid until completed.'};
}
function parse(input){
  if(typeof input==='string'){if(input.length>3e6)fail('Reference JSON is too large (maximum 3 MB).');try{input=JSON.parse(input);}catch{fail('Reference is not valid JSON.');}}
  obj(input,'Reference');if(input.format!==FORMAT)fail('Use a '+FORMAT+' export.');
  const raw=obj(input.state,'Reference state');if(raw.game!=='NLHE')fail('Only NLHE reference states are supported.');
  const state=canonicalState(stateAsView(raw));
  if(!['cash','tournament'].includes(raw.mode))fail('Reference mode must be cash or tournament.');
  const rr=obj(input.rules,'Reference rules');if(rr.noFlopNoDrop!==true)fail('This trainer requires an explicitly stated no-flop-no-drop rake rule.');
  const r=rules({rakePct:rr.rakePct,rakeCap:rr.rakeCap,tournament:rr.tournament});
  if(state.mode==='cash'&&r.tournament)fail('Cash references cannot use tournament payout rules.');
  if(state.mode==='tournament'&&r.rakePct)fail('Tournament reference pots must not charge cash-game rake.');
  if(input.evConvention!=='net-from-decision')fail('Reference EV convention must be net-from-decision.');
  if(input.unit!==(r.tournament?'prize units':'BB'))fail('EV units must be '+(r.tournament?'prize units':'BB')+' for these rules.');
  const s=obj(input.source,'Source'),url=typeof s.url==='string'?s.url.trim():'';if(url&&!/^https?:\/\/[^\s]+$/i.test(url))fail('Source URL must be http or https.');
  const source={tool:str(s.tool,'Source tool',200),version:str(s.version,'Source version',100),url,notes:String(s.notes||'').slice(0,10000),verification:'User supplied; not independently verified'};
  const assumptions=normalizeAssumptions(input.assumptions,state),actions=normalizeActions(input.actions,state);
  const frequencies=actions.filter(a=>a.frequency!==null);if(frequencies.length&&frequencies.length!==actions.length)fail('Supply either all action frequencies or none.');if(frequencies.length&&Math.abs(frequencies.reduce((s,a)=>s+a.frequency,0)-1)>1e-6)fail('Action frequencies must sum to 1.');
  return {format:FORMAT,title:str(input.title,'Reference title',200),source,state,rules:r,assumptions,unit:input.unit,evConvention:input.evConvention,actions,id:'ref-'+hash(stable({state,r,assumptions,actions,source}))};
}
function match(reference,decision,options={}){
  const r=parse(reference),state=canonicalState(decision),rr=rules(options),stateMatches=stable(r.state)===stable(state)&&stable(r.rules)===stable(rr);
  let assumptionsMatch=false;if(options.referenceAssumptions){try{assumptionsMatch=stable(r.assumptions)===stable(normalizeAssumptions(options.referenceAssumptions,state));}catch{assumptionsMatch=false;}}
  const matched=stateMatches&&assumptionsMatch;
  return {stateMatches,assumptionsMatch,matched,reason:!stateMatches?'The cards, stacks, betting history, legal actions, rake, or payout rules differ. This reference cannot grade this decision.':!assumptionsMatch?'The decision state matches. These are external range and strategy assumptions, so their EVs are shown separately and do not grade the local model.':'State and declared range/tree assumptions match. Source EVs remain user supplied, not independently verified by this app.',actions:r.actions,source:r.source,title:r.title,unit:r.unit};
}
function runBenchmarks(){
  const checks=[],check=(id,title,expected,fn,detail,tol=1e-10)=>{try{const actual=fn();checks.push({id,title,expected,actual,passed:Number.isFinite(actual)&&Math.abs(actual-expected)<=tol,detail});}catch(e){checks.push({id,title,expected,actual:null,passed:false,detail:String(e.message||e)});}};
  check('river-price','River call price',.25,()=>ratio(60,20),'A 40 BB pot plus a 20 BB bet: calling 20 needs 20 / 80 = 25%.');
  check('range-equity','Exact weighted river range',.2,()=>equityExact(['Js','Jc'],['3s','7d','4h','Ac','8s'],[{cards:['Ad','Kd'],weight:4},{cards:['Kd','Qd'],weight:1}]).equity,'JJ beats the one-weight KQ bluff and loses to the four-weight AK value hand.');
  check('river-ev','River call expected value',-4,()=>terminalCall({pot:60,call:20,equity:.2}).callEV,'20% × 80 − 20 = −4 BB relative to folding.');
  check('rake','Rake-adjusted river call',-4.6,()=>terminalCall({pot:60,call:20,equity:.2,rakePct:5,rakeCap:3}).callEV,'5% rake is capped at 3: 20% × 77 − 20 = −4.6 BB.');
  check('tie','Shared-board split equity',.5,()=>equityExact(['2d','3c'],['Ac','Kd','Qh','Js','Tc'],[{cards:['4d','5h'],weight:1}]).equity,'Both players use the board’s ace-high straight and split the pot.');
  check('dirty-outs','Turn all-in with dirty flush outs',7/44,()=>equityExact(['As','Qs'],['Js','8s','4d','2h'],[{cards:['8h','8d'],weight:1}]).equity,'Seven winning spades out of 44 unseen cards. 2♠ and 4♠ complete a flush but give the set a full house.');
  check('bluff-price','Zero-equity bluff threshold',.4,()=>pureBluff(45,30,.35).requiredFolds,'A 30 BB bluff into 45 BB needs 30 / 75 = 40% folds.');
  check('bluff-ev','Zero-equity bluff expected value',-3.75,()=>pureBluff(45,30,.35).ev,'35% × 45 − 65% × 30 = −3.75 BB.');
  check('toy-bluff','Toy equilibrium bluff rate',.5,()=>toyRiver().airBetFrequency,'With half nuts / half air and one pot-sized bet, half the air bluffs.');
  check('toy-call','Toy equilibrium call rate',.5,()=>toyRiver().defenderCallFrequency,'The bluff-catcher calls half the time, making zero-equity bluffing indifferent.');
  check('toy-indifference','Toy equilibrium defender indifference',0,()=>toyRiver().defenderCallEV,'The betting range is two value combinations per bluff: (1/3 × 200) − (2/3 × 100) = 0.');
  check('side-pot','All-in side-pot awards',150,()=>{
    const h=new P.Hand({bb:10,button:0,mode:'cash',players:[{id:0,name:'A',hero:true,stack:50},{id:1,name:'B',stack:100},{id:2,name:'C',stack:150}]},123,{holes:{0:['As','Ah'],1:['Kc','Kd'],2:['Qc','Qd']},board:['2c','3d','7h','8s','9c']});
    h.act('raise',50);h.act('raise',100);h.act('call');if(!h.done||h.players[1].stack!==100||h.players[2].stack!==50)throw Error('Unexpected side-pot distribution.');return h.players[0].stack;
  },'Contributions 50/100/100: A wins the 150 main pot, B wins the 100 side pot, and C keeps 50 uncommitted.');
  return {version:VERSION,passed:checks.filter(c=>c.passed).length,total:checks.length,checks,sources:SOURCES,toy:toyRiver(),scope:'These checks verify arithmetic and a deliberately restricted toy game. They do not certify the opponent model or solve arbitrary NLHE hands.'};
}
return {version:VERSION,format:FORMAT,sources:SOURCES,ratio,terminalCall,pureBluff,equityExact,toyRiver,canonicalState,rules,template,parse,match,runBenchmarks};
});
