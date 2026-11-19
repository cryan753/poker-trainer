/* River 90 Decision Lab. Model-based counterfactual analysis, not a GTO solver.
 * All inputs are public decision snapshots plus hero's cards. Never pass a
 * completed Hand here: hidden cards, future boards and the original deal seed
 * are deliberately neither copied nor read. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    const poker = require('./engine.js');
    try { poker.Tournament = require('./tournament.js'); } catch (_) {}
    const api = factory(poker); poker.Analysis = api; module.exports = api;
  } else { root.Poker.Analysis = factory(root.Poker); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Poker) {
  'use strict';
  if (!Poker || !Poker.Hand) throw Error('Load the poker rules engine before Decision Lab.');
  const VERSION = '1.0.0';
  const ACTIONS = ['fold', 'check', 'call', 'raise'];
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const sigmoid = x => 1 / (1 + Math.exp(-clamp(x, -35, 35)));
  const sum = xs => xs.reduce((a, b) => a + b, 0);
  const copy = x => JSON.parse(JSON.stringify(x));
  const order = (n, start) => Array.from({length:n}, (_, k) => (start + k) % n);
  const fmt = n => Number(n.toFixed(2)).toString();
  const cardText = cards => cards.map(Poker.text).join(' ');
  const clock = () => typeof performance !== 'undefined' ? performance.now() : Date.now();

  function integer(x, name, fallback) {
    if (x === undefined && fallback !== undefined) return fallback;
    if (!Number.isSafeInteger(x) || x < 0) throw Error(name + ' must be a nonnegative whole chip amount.');
    return x;
  }
  function sanitizeDecision(input) {
    if (!input || !input.view || !input.action) throw Error('A recorded decision with view and action is required.');
    const s = input.view, n = integer(s.n, 'Seat count');
    if (n < 2 || n > 9) throw Error('Decision Lab supports 2–9 seats.');
    const seat = integer(s.seat, 'Hero seat'), street = integer(s.street, 'Street');
    if (seat >= n || street > 3) throw Error('Invalid seat or street.');
    const hole = (s.hole || []).map(Poker.card), board = (s.board || []).map(Poker.card);
    if (hole.length !== 2 || board.length !== [0, 3, 4, 5][street]) throw Error('The cards do not match this decision street.');
    if (new Set(hole.concat(board)).size !== hole.length + board.length) throw Error('The decision contains a duplicate known card.');
    const bb = integer(s.bb, 'Big blind'); if (bb < 2) throw Error('Invalid big blind.');
    const v = {seat, street, n, bb, hole, board, hero:true, profile:String(s.profile || 'tight-aggressive'),
      id:s.id === undefined ? seat : s.id, name:String(s.name || 'You'), position:String(s.position || ''),
      button:integer(s.button, 'Button'), stack:integer(s.stack, 'Hero stack'), bet:integer(s.bet, 'Hero bet', 0),
      total:integer(s.total, 'Hero contribution', 0), dead:integer(s.dead, 'Hero ante', 0),
      currentBet:integer(s.currentBet, 'Current bet', 0), lastFullRaise:integer(s.lastFullRaise, 'Last full raise', bb),
      raiseCount:integer(s.raiseCount, 'Raise count', 0), lastAggressor:s.lastAggressor,
      mode:s.mode === 'tournament' ? 'tournament' : 'cash', pot:integer(s.pot, 'Pot'),
      sb:integer(s.sb, 'Small blind', Math.round(bb / 2)),
      rakePct:Number(s.rakePct) || 0, rakeCap:integer(s.rakeCap, 'Rake cap', 0),
      start:integer(s.start, 'Hero starting stack', integer(s.stack, 'Hero stack') + integer(s.total, 'Hero contribution', 0)),
      opponents:[], history:[]};
    if (v.button >= n || !s.legal) throw Error('Decision is missing legal-action information.');
    v.legal = {call:integer(s.legal.call, 'Call price', 0), check:!!s.legal.check, fold:!!s.legal.fold,
      raise:!!s.legal.raise, minRaise:integer(s.legal.minRaise, 'Minimum raise', 0),
      fullMinRaise:integer(s.legal.fullMinRaise, 'Full minimum raise', s.legal.minRaise || 0),
      maxRaise:integer(s.legal.maxRaise, 'Maximum raise', v.bet + v.stack),
      shortOnly:!!s.legal.shortOnly, reopened:s.legal.reopened !== false};
    const seats = new Set([seat]);
    for (const p of s.opponents || []) {
      const k = integer(p.seat, 'Opponent seat');
      if (k >= n || seats.has(k)) throw Error('Each table seat must appear exactly once.');
      seats.add(k);
      v.opponents.push({seat:k, id:p.id === undefined ? k : p.id, name:String(p.name || 'Seat ' + (k + 1)),
        profile:String(p.profile || 'tight-aggressive'), position:String(p.position || ''),
        stack:integer(p.stack, 'Opponent stack'), bet:integer(p.bet, 'Opponent bet', 0),
        total:integer(p.total, 'Opponent contribution', 0), dead:integer(p.dead, 'Opponent ante', 0),
        start:integer(p.start, 'Opponent starting stack', p.stack + (p.total || 0)), folded:!!p.folded,
        lastAction:String(p.lastAction || '')});
    }
    if (seats.size !== n) throw Error('The public snapshot must include every seat.');
    for (const p of [v].concat(v.opponents)) if (p.dead > p.total || p.bet > p.total - p.dead) throw Error('Inconsistent pot contributions.');
    if (v.pot !== v.total + sum(v.opponents.map(p => p.total))) throw Error('The recorded pot does not match public contributions.');
    for (const e of s.history || []) {
      if (!['post', 'check', 'call', 'fold', 'raise', 'return', 'street'].includes(e.kind)) continue;
      if (!Number.isInteger(e.street) || e.street > street || e.street < 0) continue;
      const eb = (e.board || []).map(Poker.card);
      if (eb.some((c, i) => board[i] !== c)) throw Error('History contains a board unavailable at this decision.');
      v.history.push({kind:e.kind, street:e.street, seat:e.seat, name:String(e.name || ''),
        amount:Number(e.amount) || 0, total:Number(e.total) || 0, pot:Number(e.pot) || 0,
        board:eb, label:String(e.label || '')});
    }
    if (Array.isArray(s.pending) && s.pending.every(i => Number.isInteger(i) && i >= 0 && i < n)) v.pending = s.pending.slice();
    if (Array.isArray(s.actedAt) && s.actedAt.length === n) v.actedAt = s.actedAt.map(x => x === null ? null : integer(x, 'Last action bet'));
    v.active = 1 + v.opponents.filter(p => !p.folded).length;
    const a = input.action, kind = a.kind === 'bet' ? 'raise' : a.kind;
    if (!ACTIONS.includes(kind)) throw Error('Unrecognized recorded action.');
    const total = kind === 'raise' ? integer(a.total === undefined ? v.bet + a.amount : a.total, 'Chosen raise total') : kind === 'call' ? v.bet + v.legal.call : v.bet;
    if (kind === 'raise' && (!v.legal.raise || total < v.legal.minRaise || total > v.legal.maxRaise)) throw Error('The recorded raise was not legal at this snapshot.');
    if (kind !== 'raise' && !v.legal[kind]) throw Error('The recorded action was not legal at this snapshot.');
    return {view:v, action:{kind,total,amount:kind === 'raise' ? total - v.bet : kind === 'call' ? v.legal.call : 0}};
  }

  function profile(v, opts) {
    const original = Poker.PROFILES[v.profile] || Poker.PROFILES['tight-aggressive'];
    const p = Object.assign({}, original);
    // Sensitivity scenarios change the modeled opponents, never hero's continuation policy.
    if (!v.hero) {
      p.aggr = clamp(p.aggr + (Number(opts.aggression) || 0), 0, 1);
      p.call = clamp(p.call + (Number(opts.calling) || 0), -.25, .4);
      p.bluff = clamp(p.bluff + (Number(opts.bluff) || 0), 0, .65);
    }
    return p;
  }
  function floorFor(pos, n) {
    if (n === 2) return .28;
    return pos === 'BTN' ? .36 : pos === 'SB' ? .40 : pos === 'CO' ? .46 : pos === 'HJ' ? .53 : /LJ|MP/.test(pos) ? .56 : .59;
  }
  function handSignal(v) {
    const f = Poker.features(v.hole, v.board);
    if (v.street === 0) return {f, value:Poker.strength(v.hole), draw:0};
    const hr = v.hole.map(Poker.rank), br = v.board.map(Poker.rank), max = Math.max(...br);
    let value = [.07,.35,.66,.79,.87,.91,.96,.99,.999][f.category];
    if (f.topPair) value = .59 + Math.max(...hr.filter(r => r !== max), 2) / 140;
    else if (f.overpair) value = .72 + Math.min(...hr) / 300;
    else if (f.category === 1 && !f.boardOnly) value = .25 + (f.ev.kickers[0] / Math.max(14, max)) * .22;
    if (f.boardOnly) value = .12 + Math.max(...hr) / 180;
    // A complete board's made category is not automatically hero's made hand.
    if (v.board.length === 5) {
      const boardEval = Poker.evaluate(v.board);
      if (boardEval.value === f.ev.value) value = .13;
      else if (boardEval.category >= 2 && f.category === boardEval.category) value = .35 + Math.max(...hr) / 100;
    }
    const suits = [0,0,0,0]; v.board.forEach(c => suits[Poker.suit(c)]++);
    const mono = Math.max(...suits);
    if (mono >= 3 && f.category < 5) value -= .06 * (mono - 2);
    if (v.board.length >= 4 && new Set(br).size === v.board.length && f.category < 4) {
      const sorted = [...new Set(br)].sort((a,b) => a-b);
      if (sorted[sorted.length-1] - sorted[0] <= 5) value -= .06;
    }
    let draw = f.flushDraw ? .17 : 0;
    draw += f.straightOutRanks.length >= 2 ? .13 : f.straightOutRanks.length ? .065 : 0;
    if (v.street === 1) draw *= 1.12;
    return {f, value:clamp(value + draw * .65, .015, .999), draw:clamp(draw,0,.28)};
  }
  function raiseTotal(v, p, info) {
    const l = v.legal, bb = v.bb;
    let t;
    if (v.street === 0) {
      const limps = (v.history || []).filter(e => e.street === 0 && e.kind === 'call' && e.total <= bb).length;
      t = v.currentBet <= bb ? (v.mode === 'tournament' ? 2.2 : 2.6) * bb + limps * .9 * bb : v.currentBet * (v.position === 'BTN' ? 3 : 3.6);
    } else if (v.currentBet === 0) {
      const fraction = Number.isFinite(p.size) ? p.size : info.value > .8 ? .8 : info.value > .56 ? .62 : info.draw ? .55 : .45;
      t = Math.max(bb, v.pot * fraction);
      if (p.overbet > .3 && v.street >= 2 && info.value > .82 && v.stack > v.pot * 2) t = v.pot * 1.25;
    } else t = v.currentBet + Math.max(v.currentBet * 1.8, v.pot * .6);
    if (t - v.bet > v.stack * .72 && info.value > .65) t = l.maxRaise;
    return Math.round(clamp(t, l.minRaise, l.maxRaise));
  }
  // Authored probabilistic policy. It sees only this player's own hole cards and
  // public state. It is deliberately independent of sampled opponents' cards.
  function policy(v, opts) {
    const p = profile(v, opts), l = v.legal, info = handSignal(v), s = info.value;
    let raise = 0, call = 0;
    if (v.street === 0) {
      let threshold = floorFor(v.position, v.n) + (.27 - p.loose) * .46;
      if (v.currentBet > v.bb) threshold += .025 + Math.min(.30, Math.log2(Math.max(1,v.currentBet / (2.5 * v.bb))) * .10);
      const good = sigmoid((s - threshold) * 19);
      if (l.check) raise = good * (p.aggr * .85 + .08) + p.bluff * .06;
      else {
        call = sigmoid((s - threshold + .07 + p.call - .06 * (l.call / Math.max(1,v.stack))) * 17);
        raise = sigmoid((s - (v.currentBet > v.bb ? .83 : threshold + .02)) * 22) * p.aggr * .78 + p.bluff * .035;
      }
    } else {
      const multi = Math.max(0, v.active - 2), need = l.call / Math.max(1, v.pot + l.call);
      if (l.check) {
        const valueChance = sigmoid((s - .61 - multi * .045) * 17) * (p.aggr + .12);
        const bluffChance = p.bluff * (multi ? .36 : 1) * (info.f.category <= 1 ? 1 : .12);
        const semiChance = info.draw > 0 ? p.aggr * .24 : 0;
        raise = Math.max(valueChance, bluffChance, semiChance);
        if (info.value > .8 && Number.isFinite(p.trap)) raise *= 1 - p.trap;
        if (v.profile === 'legend-ivey' && info.f.category === 0 && !info.draw && (v.opponents || []).some(o=>!o.folded&&o.profile==='calling-station')) raise *= .15;
      } else {
        const pressure = l.call / Math.max(1, v.stack);
        const required = need + .09 + multi * .04 + Math.min(.18, v.raiseCount * .045) + pressure * .08 - p.call;
        call = sigmoid((s - required) * 13);
        raise = sigmoid((s - .8 - multi * .025) * 22) * p.aggr * .82;
        if (info.draw && v.street < 3) raise += p.bluff * (v.profile==='legend-brunson' ? .8 : .32);
        if (info.f.category <= 1) raise += p.bluff * (multi ? .025 : .075);
      }
    }
    // The finite continuation tree stops reraising after two raises on a street.
    // This is an explicit abstraction; initial candidate actions are never capped.
    if (!l.raise || v.raiseCount >= 2) raise = 0;
    raise = clamp(raise, 0, .98);
    const out = [];
    if (l.check) { out.push({kind:'check', total:v.bet, probability:1-raise}); }
    else {
      call = clamp(call, 0, 1) * (1-raise);
      out.push({kind:'fold',total:v.bet,probability:1-raise-call}, {kind:'call',total:v.bet+l.call,probability:call});
    }
    if (raise > 0) out.push({kind:'raise',total:raiseTotal(v,p,info),probability:raise});
    return out.filter(a => a.probability > 1e-12);
  }

  function publicReplay(v) {
    const people = Array(v.n);
    for (const p of [v].concat(v.opponents)) people[p.seat] = {seat:p.seat,id:p.id,name:p.name,profile:p.profile,position:p.position,
      stack:p.stack+p.total,total:0,bet:0,dead:0,folded:false,actedAt:null,lastAction:''};
    const initial = people.map(p => p.stack), contexts = [];
    let street=0, board=[], currentBet=v.bb, lastFullRaise=v.bb, raiseCount=0, history=[];
    for (const e of v.history) {
      if (e.kind === 'street') {
        street=e.street; board=e.board.slice(); currentBet=0; lastFullRaise=v.bb; raiseCount=0;
        people.forEach(p => { p.bet=0; p.actedAt=null; }); history.push(e); continue;
      }
      if (!Number.isInteger(e.seat) || !people[e.seat]) { history.push(e); continue; }
      const p=people[e.seat];
      if (ACTIONS.includes(e.kind)) {
        const call=Math.max(0,Math.min(p.stack,currentBet-p.bet)),cap=p.bet+p.stack,min=currentBet===0?v.bb:currentBet+lastFullRaise;
        const reopened=p.actedAt===null||currentBet-p.actedAt>=lastFullRaise;
        contexts.push({seat:e.seat,event:e,view:{seat:e.seat,hero:false,profile:p.profile,position:p.position,n:v.n,bb:v.bb,mode:v.mode,
          street:e.street,board:e.board.slice(),stack:p.stack,bet:p.bet,total:p.total,dead:p.dead,pot:sum(people.map(x=>x.total)),
          currentBet,lastFullRaise,raiseCount,active:people.filter(x=>!x.folded).length,history:history.slice(),
          opponents:people.filter(x=>x.seat!==e.seat).map(x=>({seat:x.seat,profile:x.profile,folded:x.folded,stack:x.stack,bet:x.bet,total:x.total})),
          legal:{call,check:call===0,fold:call>0,raise:people.some(x=>x.seat!==p.seat&&!x.folded&&x.stack>0)&&reopened&&cap>currentBet,
            minRaise:Math.min(min,cap),maxRaise:cap,fullMinRaise:min,reopened}}});
      }
      if (e.kind==='post') {
        p.stack-=e.amount;p.total+=e.amount;
        if (/ante/i.test(e.label)) p.dead+=e.amount; else p.bet+=e.amount;
      } else if(e.kind==='return') {p.stack+=e.amount;p.total-=e.amount;p.bet=Math.max(0,p.bet-e.amount);}
      else if(ACTIONS.includes(e.kind)) {
        if(e.kind==='fold')p.folded=true;
        if(e.kind==='call'||e.kind==='raise'){p.stack-=e.amount;p.total+=e.amount;p.bet+=e.amount;}
        if(e.kind==='raise'){const inc=p.bet-currentBet;if(inc>=lastFullRaise)lastFullRaise=inc;currentBet=p.bet;raiseCount++;}
        p.actedAt=currentBet;
      }
      history.push(e);
    }
    // Legacy snapshots can lack complete history. Never silently inherit an
    // obviously wrong reopening state: hero's recorded legal flags take priority.
    const acted=people.map(p=>p.actedAt);
    if(!v.legal.reopened)acted[v.seat]=v.currentBet;
    return {contexts,actedAt:acted,initial};
  }

  function rangesFor(v, opts, replay) {
    const known=new Set(v.hole.concat(v.board)),available=Array.from({length:52},(_,i)=>i).filter(c=>!known.has(c));
    return v.opponents.filter(p=>!p.folded).map(opp=>{
      const override=opts.rangesOverride && (opts.rangesOverride[opp.seat] || opts.rangesOverride[String(opp.seat)]);
      const acts=replay.contexts.filter(c=>c.seat===opp.seat),combos=[];
      if(override!==undefined){
        if(!Array.isArray(override)||!override.length)throw Error('A range override needs at least one weighted combination.');
        const merged=new Map();
        for(const c of override){const cards=(c.cards||[]).map(Poker.card).sort((a,b)=>a-b),weight=Number(c.weight===undefined?1:c.weight);
          if(cards.length!==2||cards[0]===cards[1]||!Number.isFinite(weight)||weight<0)throw Error('Invalid weighted range combination.');
          if(!weight||cards.some(x=>known.has(x)))continue;
          const key=cards.join(',');merged.set(key,{cards,weight:weight+(merged.get(key)?.weight||0)});
        }
        combos.push(...merged.values());
      }else{
        for(let i=0;i<available.length-1;i++)for(let j=i+1;j<available.length;j++){
          const cards=[available[i],available[j]];let weight=1;
          for(const ctx of acts){
            const pv=Object.assign({},ctx.view,{hole:cards}),dist=policy(pv,opts),match=dist.find(a=>a.kind===ctx.event.kind);
            let likelihood=match?match.probability:.002;
            if(match&&ctx.event.kind==='raise'){
              const observed=Math.max(v.bb,ctx.event.total-pv.bet),predicted=Math.max(v.bb,match.total-pv.bet);
              likelihood*=.04+.96*Math.exp(-.5*Math.pow(Math.log(observed/predicted)/.78,2));
            }
            weight*=Math.max(1e-5,likelihood);
          }
          combos.push({cards,weight:Math.max(1e-250,weight)});
        }
      }
      const total=sum(combos.map(c=>c.weight));if(!total)throw Error('No legal combinations remain in '+opp.name+'’s range.');
      let cumulative=0;for(const c of combos){c.weight/=total;cumulative+=c.weight;c.cumulative=cumulative;}
      const sorted=combos.slice().sort((a,b)=>b.weight-a.weight);
      return {seat:opp.seat,name:opp.name,profile:opp.profile,overridden:override!==undefined,combos,
        summary:(override!==undefined?'Your current-range override':acts.length?'Updated through '+acts.length+' observed action'+(acts.length===1?'':'s'):'Unacted range: all legal starting combinations')+
          '; '+combos.length+' legal combinations. Weights are model assumptions.',
        examples:sorted.slice(0,5).map(c=>cardText(c.cards)+' ('+fmt(c.weight*100)+'%)')};
    });
  }
  function alternatives(v, actual) {
    const rows=[],seen=new Set();
    function add(kind,total){const id=kind+(kind==='raise'?':'+total:'');if(seen.has(id))return;seen.add(id);
      const amount=kind==='raise'?total-v.bet:kind==='call'?v.legal.call:0;
      const label=kind==='raise'?(v.currentBet===0?'Bet ':'Raise to ')+fmt(total/v.bb)+' BB'+(total===v.legal.maxRaise?' · all-in':''):
        kind==='call'?'Call '+fmt(amount/v.bb)+' BB':kind==='fold'?'Fold':'Check';
      rows.push({id,kind,total,amount,label,isActual:kind===actual.kind&&(kind!=='raise'||total===actual.total)});
    }
    if(v.legal.fold)add('fold',v.bet);if(v.legal.check)add('check',v.bet);if(v.legal.call)add('call',v.bet+v.legal.call);
    if(v.legal.raise){
      const targets=v.street===0?(v.currentBet<=v.bb?[2.5*v.bb,4*v.bb]:[v.currentBet*2.7,v.currentBet*3.8]):
        v.currentBet===0?[v.pot*.33,v.pot*.66,v.pot,v.pot*1.4]:[v.currentBet+Math.max(v.lastFullRaise,v.pot*.5),v.currentBet+v.pot];
      for(const t of targets)add('raise',Math.round(clamp(t,v.legal.minRaise,v.legal.maxRaise)));
      if(v.legal.maxRaise-v.bet<=Math.max(v.pot*2.5,v.bb*22))add('raise',v.legal.maxRaise);
    }
    add(actual.kind,actual.total);return rows;
  }

  function drawWeighted(range,random,used) {
    for(let tries=0;tries<200;tries++){
      const x=random();let lo=0,hi=range.combos.length-1;
      while(lo<hi){const mid=(lo+hi)>>1;if(range.combos[mid].cumulative<x)lo=mid+1;else hi=mid;}
      const c=range.combos[lo];if(!used.has(c.cards[0])&&!used.has(c.cards[1]))return c.cards;
    }
    const legal=range.combos.filter(c=>!used.has(c.cards[0])&&!used.has(c.cards[1])),total=sum(legal.map(c=>c.weight));
    if(!total)return null;let x=random()*total;for(const c of legal){x-=c.weight;if(x<=0)return c.cards;}return legal[legal.length-1].cards;
  }
  function scenario(v,ranges,random,knownOpponent,knownRunout) {
    const used=new Set(v.hole.concat(v.board)),holes=Array(v.n),runout=v.board.slice();holes[v.seat]=v.hole.slice();
    if(knownOpponent){holes[knownOpponent.seat]=knownOpponent.cards.slice();knownOpponent.cards.forEach(c=>used.add(c));}
    if(knownRunout){for(const c of knownRunout){if(used.has(c))throw Error('Duplicate scenario card.');runout.push(c);used.add(c);}}
    // Sequentially conditioning ranges prevents impossible duplicate cards. Seat
    // order is randomized to reduce systematic ordering effects in multiway pots.
    const rs=ranges.filter(r=>!holes[r.seat]).slice();
    for(let i=rs.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[rs[i],rs[j]]=[rs[j],rs[i]];}
    for(const range of rs){const cards=drawWeighted(range,random,used);if(!cards)return null;holes[range.seat]=cards.slice();cards.forEach(c=>used.add(c));}
    let available=Array.from({length:52},(_,i)=>i).filter(c=>!used.has(c));
    function take(){const j=Math.floor(random()*available.length),c=available[j];available[j]=available[available.length-1];available.pop();return c;}
    while(runout.length<5)runout.push(take());
    // Folded cards are unknown random dead cards. Their action-dependent card
    // removal is not modeled; assigning them after the runout integrates that assumption.
    for(let i=0;i<v.n;i++)if(!holes[i])holes[i]=[take(),take()];
    return {holes,runout,deck:available};
  }

  function restore(v,sc,replay,opts) {
    const h=Object.create(Poker.Hand.prototype),people=Array(v.n),pos=Poker.positions(v.n,v.button);
    for(const p of [v].concat(v.opponents)){
      people[p.seat]={id:p.id,name:p.name,profile:p.profile,hero:p.seat===v.seat,start:p.stack+p.total,
        stack:p.stack,hole:sc.holes[p.seat].slice(),bet:p.bet,total:p.total,dead:p.dead,folded:!!p.folded,
        actedAt:(v.actedAt||replay.actedAt)[p.seat],lastAction:p.lastAction||'',payout:0};
      if(p.position)pos[p.seat]=p.position;
    }
    if(!v.legal.reopened)people[v.seat].actedAt=v.currentBet;
    else if(v.legal.raise&&people[v.seat].actedAt!==null&&v.currentBet-people[v.seat].actedAt<v.lastFullRaise)people[v.seat].actedAt=null;
    const rakePct=v.mode==='cash'?clamp(Number(opts.rakePct===undefined?v.rakePct:opts.rakePct)||0,0,10):0;
    const rakeCap=Math.max(0,Math.round(Number(opts.rakeCap===undefined?v.rakeCap:opts.rakeCap)||0));
    Object.assign(h,{config:{bb:v.bb,sb:v.sb,button:v.button,mode:v.mode,rakePct,rakeCap,anteType:'none',ante:0,players:people.map(p=>({id:p.id,name:p.name,profile:p.profile,hero:p.hero,stack:p.start}))},
      seed:0x713749,players:people,n:v.n,button:v.button,bb:v.bb,hero:v.seat,pos,street:v.street,board:v.board.slice(),
      logs:copy(v.history),decisions:[],done:false,currentBet:v.currentBet,lastFullRaise:v.lastFullRaise,raiseCount:v.raiseCount,
      lastAggressor:v.lastAggressor,fee:0,pots:[],turn:v.seat,serial:0,fixed:{},runout:sc.runout.slice(),deck:sc.deck.slice()});
    h.sbSeat=v.n===2?v.button:(v.button+1)%v.n;h.bbSeat=(h.sbSeat+1)%v.n;
    h.pending=v.pending?v.pending.slice():order(v.n,v.seat).filter(i=>!people[i].folded&&people[i].stack>0&&(i===v.seat||people[i].bet<v.currentBet||people[i].actedAt===null));
    if(h.pending[0]!==v.seat)h.pending=[v.seat].concat(h.pending.filter(i=>i!==v.seat));
    return h;
  }
  function cloneHand(h) {
    const c=Object.create(Poker.Hand.prototype);
    for(const key of Object.keys(h))c[key]=typeof h[key]==='object'&&h[key]!==null?copy(h[key]):h[key];
    return c;
  }
  function apply(h,a){h.act(a.kind,a.kind==='raise'?a.total:0);}
  function pick(dist,r){let x=r();for(const a of dist){x-=a.probability;if(x<=0)return a;}return dist[dist.length-1];}
  function terminal(h,v,ctx) {
    const chip=(h.players[v.seat].stack-v.stack)/v.bb;
    if(!ctx.tournament)return {chip,utility:chip,utilitySE:0};
    const stacks=h.players.map(p=>p.stack).concat(ctx.tournament.otherStacks||[]),key=stacks.join(',');
    let val=ctx.icmCache.get(key);
    if(val===undefined){
      const settings={seed:ctx.seed^0x5f32,samples:256,startStacks:ctx.startStacks};
      val=Poker.Tournament.details?Poker.Tournament.details(stacks,v.seat,ctx.tournament.payouts,settings):{value:Poker.Tournament.value(stacks,v.seat,ctx.tournament.payouts,settings),se:0};
      if(typeof val==='number')val={value:val,se:0};
      if(!Number.isFinite(val.value))throw Error('Tournament payout calculation failed.');
      ctx.icmCache.set(key,val);if(val.se>0)ctx.sampledICM=true;
    }
    return {chip,utility:val.value,utilitySE:Number(val.se)||0};
  }
  function continueSample(h,v,opts,random,ctx) {
    let moves=0,nextDecision=null;
    while(!h.done&&moves++<180){
      const pv=h.view(h.turn),dist=policy(pv,opts);
      if(!nextDecision&&h.turn===v.seat&&h.street>v.street)nextDecision={street:h.street,board:h.board.slice(),call:pv.legal.call,dist:dist.map(a=>({kind:a.kind,probability:a.probability,total:a.total})),pot:pv.pot};
      apply(h,pick(dist,random));
    }
    if(!h.done)throw Error('Continuation policy exceeded its betting limit.');
    h.assert();return Object.assign(terminal(h,v,ctx),{nextDecision});
  }
  function continueExact(h,v,opts,ctx,depth) {
    if(h.done){h.assert();return terminal(h,v,ctx);}
    if(depth>18)throw Error('Exact river policy tree exceeded its bound.');
    const dist=policy(h.view(h.turn),opts);let chip=0,utility=0,utilitySE=0;
    for(const a of dist){const next=cloneHand(h);apply(next,a);const t=continueExact(next,v,opts,ctx,depth+1);chip+=a.probability*t.chip;utility+=a.probability*t.utility;utilitySE+=a.probability*t.utilitySE;}
    return {chip,utility,utilitySE};
  }
  function responseAt(h,v,opts){
    if(h.done||h.turn===v.seat||h.street!==v.street)return null;
    return {seat:h.turn,cards:h.players[h.turn].hole.slice(),dist:policy(h.view(h.turn),opts),
      comparison:v.street?Math.sign(Poker.evaluate(h.players[h.turn].hole.concat(v.board)).value-Poker.evaluate(v.hole.concat(v.board)).value):null};
  }
  function addResponse(row,response,weight) {
    if(!response)return;row.responseWeight+=weight;
    for(const a of response.dist){row.response[a.kind]+=weight*a.probability;
      const key=cardText(response.cards);const map=row.exampleMaps[a.kind];map.set(key,(map.get(key)||0)+weight*a.probability);
      const cls=a.kind==='call'&&response.comparison!==null?(response.comparison<0?'worseCalls':response.comparison>0?'betterCalls':'equalCalls'):a.kind==='fold'&&response.comparison>0?'betterFolds':null;
      if(cls){const m=row.exampleMaps[cls];m.set(key,(m.get(key)||0)+weight*a.probability);}}
  }
  function addContinuation(row,next,v) {
    if(!next)return;
    const added=next.board.slice(v.board.length),oldRanks=v.board.map(Poker.rank),newRanks=next.board.map(Poker.rank);
    const suitCounts=[0,0,0,0];next.board.forEach(c=>suitCounts[Poker.suit(c)]++);
    let change;
    if(v.street===0)change=Math.max(...suitCounts)>=3?'three of one suit on the flop':new Set(newRanks).size<3?'paired flop':'unpaired flop';
    else if(added.some(c=>oldRanks.includes(Poker.rank(c))))change='the board pairs';
    else if(Math.max(...suitCounts)>=3)change='at least three cards of one suit';
    else if(added.some(c=>Poker.rank(c)>Math.max(...oldRanks)))change='a new overcard';
    else change='no board pair, new overcard or third suited card';
    const facing=next.call>0?'facing a bet':'no bet to call',key=next.street+'|'+change+'|'+facing;
    let group=row.continuationMap.get(key);
    if(!group){group={street:next.street,change,facing,visits:0,call:0,pot:0,examples:[],mix:{fold:0,check:0,call:0,raise:0}};row.continuationMap.set(key,group);}
    group.visits++;group.call+=next.call/v.bb;group.pot+=next.pot/v.bb;
    const example=cardText(added);if(group.examples.length<3&&!group.examples.includes(example))group.examples.push(example);
    for(const a of next.dist)group.mix[a.kind]+=a.probability;
  }
  function variance(xs,mean){return xs.length>1?sum(xs.map(x=>(x-mean)*(x-mean)))/(xs.length-1):0;}

  function analyzeDecision(input, options) {
    const started=clock(),opts=Object.assign({},options||{}),d=sanitizeDecision(input),v=d.view;
    const samples=Math.round(clamp(Number(opts.samples)||240,40,3000)),seed=(Number(opts.seed)||19370131)>>>0;
    const replay=publicReplay(v),ranges=rangesFor(v,opts,replay),acts=alternatives(v,d.action);
    const ctx={seed,icmCache:new Map(),tournament:opts.tournament||null,startStacks:Array(v.n)};
    for(const p of [v].concat(v.opponents))ctx.startStacks[p.seat]=p.start;
    if(ctx.tournament){
      if(!Poker.Tournament&&typeof require==='function'){try{Poker.Tournament=require('./tournament.js');}catch(_){}}
      if(!Poker.Tournament)throw Error('Tournament payout analysis is unavailable; load tournament.js.');
      const validated=Poker.Tournament.validate(ctx.tournament,v);
      if(validated===false||validated&&validated.valid===false)throw Error(validated.error||'Invalid tournament inputs.');
      ctx.startStacks=ctx.startStacks.concat(ctx.tournament.otherStacks||[]);
    }
    const rows=acts.map(a=>Object.assign({},a,{values:[],chipValues:[],ev:0,chipEV:0,se:0,icmSE:0,continuationMap:new Map(),method:'modeled rollout',
      response:{fold:0,call:0,raise:0,check:0},responseWeight:0,exampleMaps:{fold:new Map(),call:new Map(),raise:new Map(),check:new Map(),worseCalls:new Map(),betterCalls:new Map(),equalCalls:new Map(),betterFolds:new Map()}}));
    const random=Poker.rng(seed),headsUp=ranges.length===1;
    const exactRiver=headsUp&&v.street===3&&opts.exact!==false;
    // A terminal call can be enumerated without assuming future betting. This
    // includes an opponent all-in or a call that puts hero all-in heads-up.
    const closingCall=headsUp&&v.legal.call>0&&(v.opponents.find(o=>!o.folded).stack===0||v.legal.call===v.stack);
    const missing=5-v.board.length,remaining=50-v.board.length-2;
    const boardCount=missing===0?1:missing===1?remaining:missing===2?remaining*(remaining-1)/2:Infinity;
    const exactTerminal=closingCall&&v.street>=1&&ranges[0].combos.length*boardCount<=60000&&opts.exact!==false;
    let evaluated=0,failedScenarios=0;
    if(exactRiver){
      for(const combo of ranges[0].combos){const sc=scenario(v,ranges,random,{seat:ranges[0].seat,cards:combo.cards},[]);if(!sc)continue;
        for(const row of rows){const h=restore(v,sc,replay,opts);apply(h,row);addResponse(row,responseAt(h,v,opts),combo.weight);
          const out=continueExact(h,v,opts,ctx,0);row.ev+=combo.weight*out.utility;row.chipEV+=combo.weight*out.chip;row.icmSE+=combo.weight*out.utilitySE;row.method='exact enumeration of stated ranges and finite response policy';}
        evaluated++;
      }
    }else{
      for(let k=0;k<samples;k++){
        let sc=null;for(let attempt=0;attempt<30&&!sc;attempt++)sc=scenario(v,ranges,random);
        if(!sc){failedScenarios++;throw Error('The opponent range overrides have no consistent card assignment.');}
        const branchSeed=(seed^Math.imul(k+1,0x9e3779b1))>>>0;
        for(const row of rows){const h=restore(v,sc,replay,opts);apply(h,row);addResponse(row,responseAt(h,v,opts),1/samples);
          const out=continueSample(h,v,opts,Poker.rng(branchSeed),ctx);row.values.push(out.utility);row.chipValues.push(out.chip);row.icmSE+=out.utilitySE/samples;addContinuation(row,out.nextDecision,v);}
        evaluated++;
      }
      for(const row of rows){row.ev=sum(row.values)/samples;row.chipEV=sum(row.chipValues)/samples;row.se=Math.sqrt(variance(row.values,row.ev)/samples);}
      if(exactTerminal){
        const callRow=rows.find(r=>r.kind==='call');let utility=0,chip=0,utilitySE=0;
        for(const combo of ranges[0].combos){
          const excluded=new Set(v.hole.concat(v.board,combo.cards)),left=Array.from({length:52},(_,i)=>i).filter(c=>!excluded.has(c));
          const boards=missing===0?[[]]:missing===1?left.map(c=>[c]):[];
          if(missing===2)for(let i=0;i<left.length-1;i++)for(let j=i+1;j<left.length;j++)boards.push([left[i],left[j]]);
          for(const rest of boards){const sc=scenario(v,ranges,random,{seat:ranges[0].seat,cards:combo.cards},rest),h=restore(v,sc,replay,opts);apply(h,callRow);
            if(!h.done)throw Error('A supposedly terminal call still requires betting.');const out=terminal(h,v,ctx),weight=combo.weight/boards.length;
            utility+=weight*out.utility;chip+=weight*out.chip;utilitySE+=weight*out.utilitySE;}
        }
        callRow.ev=utility;callRow.chipEV=chip;callRow.se=0;callRow.icmSE=utilitySE;callRow.method='exact terminal-call enumeration under stated range';
      }
    }
    // Payout EV is a difference from the fold branch, or check when folding is
    // unavailable. Chip EV uses current uncommitted chips as its fixed baseline.
    const baseline=ctx.tournament?(rows.find(r=>r.kind==='fold')||rows.find(r=>r.kind==='check')||rows[0]):null;
    const baselineEV=baseline?baseline.ev:0;
    if(baseline)for(const row of rows)row.ev-=baselineEV;
    const best=rows.reduce((a,b)=>b.ev>a.ev?b:a),actual=rows.find(r=>r.isActual),bestValues=best.values.slice();
    const rawSE=new Map(rows.map(r=>[r.id,r.se])),baselineValues=baseline?baseline.values.slice():[];
    for(const row of rows){
      row.pairedLossSE=0;
      if(!exactRiver&&row.values.length&&bestValues.length){
        const differences=row.values.map((x,i)=>bestValues[i]-x),mean=sum(differences)/differences.length;
        row.pairedLossSE=Math.sqrt(variance(differences,mean)/differences.length);
        if(row.method.startsWith('exact terminal')||best.method.startsWith('exact terminal'))row.pairedLossSE=Math.sqrt(rawSE.get(row.id)**2+rawSE.get(best.id)**2);
      }
      row.pairedLossSE+=row.id===best.id?0:row.icmSE+best.icmSE;
      // Shared seeded ICM samples are correlated across leaves. The weighted
      // sum of their SEs is a conservative numerical bound, not an independence assumption.
      if(baseline){
        if(row===baseline)row.se=0;
        else{
          if(row.values.length&&baselineValues.length&&!row.method.startsWith('exact terminal')&&!baseline.method.startsWith('exact terminal')){
            const differences=row.values.map((x,i)=>x-baselineValues[i]),mean=sum(differences)/differences.length;
            row.se=Math.sqrt(variance(differences,mean)/differences.length);
          }else row.se=Math.sqrt(rawSE.get(row.id)**2+rawSE.get(baseline.id)**2);
          row.se+=row.icmSE+baseline.icmSE;
        }
      }else row.se+=row.icmSE;
      if(ctx.sampledICM)row.method+='; payout utility uses sampled ICM';
      if(row.responseWeight)for(const key of ACTIONS)row.response[key]/=row.responseWeight;
      row.responseLabel='Next opponent response on this street; not whole-table fold probability';
      function examples(kind){return [...row.exampleMaps[kind]].sort((a,b)=>b[1]-a[1]).slice(0,4).map(([cards,mass])=>cards+' · '+fmt(100*mass/Math.max(1e-12,row.responseWeight))+'% of next-response mass');}
      row.examples={calls:examples('call'),folds:examples('fold'),raises:examples('raise'),worseCalls:examples('worseCalls'),betterCalls:examples('betterCalls'),equalCalls:examples('equalCalls'),betterFolds:examples('betterFolds')};
      row.evidence={weakerCallProbability:sum([...row.exampleMaps.worseCalls.values()])/Math.max(1e-12,row.responseWeight),strongerCallProbability:sum([...row.exampleMaps.betterCalls.values()])/Math.max(1e-12,row.responseWeight),betterFoldProbability:sum([...row.exampleMaps.betterFolds.values()])/Math.max(1e-12,row.responseWeight),comparison:v.street===3?'showdown hand strength':v.street?'current made hand only; draws can improve':'not classified preflop'};
      row.continuations=[...row.continuationMap.values()].sort((a,b)=>b.visits-a.visits).slice(0,4).map(g=>({street:g.street,change:g.change,facing:g.facing,samples:g.visits,averageCall:g.call/g.visits,averagePot:g.pot/g.visits,exampleCards:g.examples,mix:Object.fromEntries(Object.entries(g.mix).map(([k,x])=>[k,x/g.visits]))}));
      delete row.values;delete row.chipValues;delete row.exampleMaps;delete row.responseWeight;delete row.continuationMap;
    }
    const loss=Math.max(0,best.ev-actual.ev),margin=actual.pairedLossSE*2;
    const close=loss<=Math.max(ctx.tournament?Math.max(...ctx.tournament.payouts)*.001:.12,margin);
    const verdict={label:actual.id===best.id?'Your action leads in this model':close?'Close decision in this model':'Prefer '+best.label.toLowerCase()+' in this model',
      confidence:close?'close':'model-dependent',detail:exactRiver?'All legal hidden combinations were enumerated under the stated range and finite response policy. '+(ctx.sampledICM?'Payout utility uses sampled ICM; its numerical error is also included. ':'')+'This is not an equilibrium solution.':
        'Alternatives include future betting under an authored continuation policy. Sampling error does not measure uncertainty about the opponent model.'};
    const heroInfo=handSignal(v),activeOpp=v.opponents.filter(o=>!o.folded),reasons=[];
    reasons.push('You chose '+actual.label.toLowerCase()+' with '+cardText(v.hole)+(v.board.length?' on '+cardText(v.board):' from '+v.position)+'. The pot was '+fmt(v.pot/v.bb)+' BB and your remaining stack was '+fmt(v.stack/v.bb)+' BB.');
    reasons.push('The comparison evaluates '+rows.map(r=>r.label.toLowerCase()).join(', ')+'. '+(actual.id===best.id?'Your choice has the highest estimated value among these tested actions.':best.label+' has '+fmt(loss)+' '+(ctx.tournament?'payout units':'BB')+' more estimated value than your choice, under these assumptions.'));
    if(v.legal.call){const cap=v.total-v.dead+v.legal.call,contest=v.total+sum(v.opponents.map(p=>p.dead+Math.min(p.total-p.dead,cap))),need=v.legal.call/(contest+v.legal.call);
      reasons.push('Your call costs '+fmt(v.legal.call/v.bb)+' BB for a contestable pot of '+fmt((contest+v.legal.call)/v.bb)+' BB after calling: '+fmt(need*100)+'% break-even equity before rake. '+(closingCall?'No later bet is required after this heads-up call.':'Later betting and separately contested side pots are included in the rollouts; this direct price alone is not the verdict.'));}
    if(best.kind==='raise'){
      if(best.examples.worseCalls.length)reasons.push('Hands '+(v.street===3?'you beat at showdown':'currently behind your made hand')+' that call '+best.label.toLowerCase()+' in this model include '+best.examples.worseCalls.slice(0,3).map(s=>s.split(' · ')[0]).join(', ')+'. They account for '+fmt(best.evidence.weakerCallProbability*100)+'% of the next opponent’s total response mass'+(v.street<3?'; draws can still improve.':'.'));
      if(best.examples.betterCalls.length)reasons.push('Stronger made hands also calling that size include '+best.examples.betterCalls.slice(0,3).map(s=>s.split(' · ')[0]).join(', ')+'. Their modeled response mass is '+fmt(best.evidence.strongerCallProbability*100)+'%.');
      if(best.response.fold)reasons.push('The next opponent folds '+fmt(best.response.fold*100)+'% to this size in the assumed model. '+(v.active>2?'Other players may still continue; this is not the chance the whole table folds.':'Calls and raises are evaluated as separate continuation branches.'));
    }
    if(actual.id!==best.id&&actual.kind==='raise'&&v.street){
      reasons.push('For your actual '+actual.label.toLowerCase()+', the next opponent’s response mass is '+fmt(actual.evidence.weakerCallProbability*100)+'% currently weaker hands calling, '+fmt(actual.evidence.strongerCallProbability*100)+'% currently stronger hands calling, and '+fmt(actual.response.raise*100)+'% raises. '+(best.kind==='raise'?'For the preferred tested size, these are '+fmt(best.evidence.weakerCallProbability*100)+'%, '+fmt(best.evidence.strongerCallProbability*100)+'%, and '+fmt(best.response.raise*100)+'%.':'The alternative’s EV also includes the consequences of checking or continuing without that bet.')+' These response differences help explain the model; they do not isolate a single causal source of the EV gap.');
      if(actual.examples.betterCalls.length)reasons.push('Examples of made hands ahead of yours that continue against your actual size: '+actual.examples.betterCalls.slice(0,3).map(s=>s.split(' · ')[0]).join(', ')+'.');
    }
    if(activeOpp.some(o=>['calling-station','tight-passive','nit'].includes(o.profile)))reasons.push('Passive or sticky opponents have separate calling and raising probabilities. A wide calling range does not imply a wide raising range.');
    const nextStreet=[];
    if(v.street<3){
      for(const g of best.continuations.slice(0,3)){
        const mix=Object.entries(g.mix).filter(([,x])=>x>=.01).sort((a,b)=>b[1]-a[1]).map(([kind,x])=>kind+' '+fmt(x*100)+'%').join(', ');
        nextStreet.push('Continuation assumed after '+best.label.toLowerCase()+': '+Poker.STREETS[g.street]+', '+g.change+' (sampled new cards: '+g.exampleCards.join('; ')+'), '+g.facing+(g.averageCall?' averaging '+fmt(g.averageCall)+' BB':'')+' — '+mix+'. This group contains '+g.samples+' sampled next decisions, not a solved future strategy.');
      }
      if(heroInfo.f.flushDraw)nextStreet.push('If the flush completes, reassess board pairing and higher flushes before treating it as a value hand; the model includes opponent redraws and future calls.');
      if(heroInfo.f.straightOutRanks.length)nextStreet.push('Potential straight-completing ranks are '+heroInfo.f.straightOutRanks.map(r=>Poker.RANKS[r-2]).join(', ')+'. A completion is not automatically a clean winning out.');
      if(heroInfo.f.overpair||heroInfo.f.topPair)nextStreet.push('An overcard, a third card of one suit, or a coordinated turn can change which worse hands pay. Recompute the decision after that public card instead of repeating today’s size automatically.');
      nextStreet.push(best.kind==='raise'?'If raised, use the opponent’s raising range and the new call price. The EV shown already includes the model’s responses; it is not a commitment to call every raise.':best.kind==='call'?'After calling, compare the next bet with the newly conditioned range and remaining stack. The current recommendation assumes the stated continuation policy.':'After a check, a new bet is a separate decision. Its size and the bettor’s range may justify a different response from this one.');
    }else nextStreet.push('This is the river: there is no draw value left. The comparison depends on showdown strength, fold/call/raise responses, and the exact price.');
    const assumptions=[
      'Opponent combination weights are inferred from public actions using an authored probability model, or your explicit current-range overrides; they are not measured professional-player ranges.',
      'Future play uses an authored probabilistic policy and a finite size menu, with at most two modeled raises per street. A best action here is not a GTO or professional-expert guarantee.',
      'Future players see only their own sampled hole cards and public information. Actual villain cards, future board cards, and the original deal seed are never used.',
      'Only the displayed candidate sizes are compared. The user’s exact recorded size is always included.',
      'Monte Carlo standard errors describe sampling variation within this fixed model, not range accuracy. Small differences should be treated as unresolved.',
      'Folded-card action correlations are not modeled. Multiway ranges use randomized sequential card removal, an approximation to a joint posterior.',
      'Rake uses the table engine’s configured no-flop-no-drop structure, cap, side pots and odd-chip rules.'
    ];
    if(ctx.tournament)assumptions.push('Payout EV uses the supplied remaining payouts and all remaining stacks with ICM. Future response policies are not ICM-optimized. It excludes future skill advantage, future blind pressure, bounties, and deal negotiations. Values are relative to '+baseline.label.toLowerCase()+'.'+(ctx.sampledICM?' ICM is sampled with a conservative numerical-error bound, not exact payout equity.':''));
    else if(v.mode==='tournament')assumptions.push('This is chip-EV tournament analysis. Enter remaining payouts and every other remaining stack to enable ICM payout comparisons.');
    const result={version:VERSION,method:(exactRiver?'Exact river enumeration under modeled responses':exactTerminal?'Exact closing-call value plus modeled alternatives':'Paired Monte Carlo continuation rollouts')+(ctx.sampledICM?' + sampled ICM utility':''),
      unit:ctx.tournament?'payout':'BB',actualId:actual.id,bestId:best.id,loss,verdict,actions:rows,
      ranges:ranges.map(r=>({seat:r.seat,name:r.name,profile:r.profile,summary:r.summary,overridden:r.overridden,examples:r.examples,combos:r.combos.map(c=>({cards:c.cards,weight:c.weight}))})),
      assumptions,reasons,nextStreet,sensitivity:{tested:false,note:'Change opponent calling or aggression assumptions and rerun with the same seed. A standard error is not a confidence interval for the opponent model.'},
      stats:{samples:exactRiver?0:samples,enumeratedCombinations:exactRiver?evaluated:0,evaluatedScenarios:evaluated,failedScenarios,
        elapsedMs:Math.round(clock()-started),seed,model:'authored continuation policy',futureCardsUsed:false,hiddenCardsUsed:false,
        payoutBaseline:baseline?baseline.label:null,icmStates:ctx.icmCache.size,sampledICM:!!ctx.sampledICM,actualFutureCardsUsed:false,actualVillainCardsUsed:false}};
    return result;
  }
  function bot(view) {
    const chosen=pick(policy(view,{}),Poker.rng(((Number(view.seed)||0)^0x72fb3a91)>>>0));
    return {kind:chosen.kind,amount:chosen.kind==='raise'?chosen.total:0};
  }
  return {version:VERSION,analyzeDecision,validateDecision:sanitizeDecision,actionDistribution:(view,opts)=>policy(view,opts||{}),bot,
    _internals:{policy,publicReplay,rangesFor,alternatives,scenario,restore,continueSample,continueExact,handSignal}};
});
