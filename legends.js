/* Independent style exercises, not replicas, endorsements, or trained professional agents. */
(function(root){
'use strict';
const P=root.Poker;if(!P)throw Error('Load the poker engine first.');
const models=[
{id:'legend-ivey',person:'Phil Ivey',alias:'Ivey [sim]',short:'PI',theme:'Adaptable pressure',loose:.34,aggr:.74,bluff:.16,call:.005,trap:.15,overbet:.18,size:.67,description:'Position-aware pressure, varied sizing and occasional traps. These are illustrative tendencies, not measured Phil Ivey statistics.',lesson:'Start with price and the action sequence. Do not use an automatic call-or-fold rule against aggression.',source:'https://www.masterclass.com/classes/phil-ivey-teaches-poker-strategy/chapters/betting-tactics'},
{id:'legend-hellmuth',person:'Phil Hellmuth',alias:'Hellmuth [sim]',short:'PH',theme:'Selective small-pot play',loose:.23,aggr:.54,bluff:.08,call:-.015,trap:.24,overbet:.025,size:.45,description:'More selective entries and smaller bets, with occasional traps. A historical small-pot theme, not a complete account of his changing strategies.',lesson:'Separate inexpensive calls from large raises. Selective does not mean incapable of bluffing.',source:'https://www.cardplayer.com/cardplayer-poker-magazines/65767-joseph-cada-22-24/articles/18902-the-scoop-phil-hellmuth'},
{id:'legend-dwan',person:'Tom Dwan',alias:'Dwan [sim]',short:'TD',theme:'Deep-stack pressure',loose:.47,aggr:.86,bluff:.24,call:.025,trap:.07,overbet:.48,size:.84,description:'Wider entries, semi-bluffs, and occasional polarized turn/river overbets at depth. Television highlights do not establish his real bluff frequencies.',lesson:'Pressure is not proof of a bluff. Compare the calling price with a plausible value-and-bluff range.',source:'https://www.youtube.com/watch?v=dS_uv88YuPs'},
{id:'legend-brunson',person:'Doyle Brunson',alias:'Brunson [sim]',short:'DB',theme:'Selective power poker',loose:.33,aggr:.78,bluff:.15,call:.005,trap:.10,overbet:.12,size:.76,description:'Strong value betting and draw aggression, with some restraint when the visible action is already aggressive.',lesson:'Distinguish applying pressure from responding to pressure. Keep value betting against weaker calling ranges.',source:'https://www.pokernewsdaily.com/doyle-brunson-interview-with-poker-news-daily-3620/'},
{id:'legend-chan',person:'Johnny Chan',alias:'Chan [sim]',short:'JC',theme:'Deception and traps',loose:.26,aggr:.61,bluff:.105,call:.015,trap:.44,overbet:.07,size:.59,description:'Selective entries, more slow-plays on suitable boards, delayed value and occasional check-raises. Not a claim that Chan always slow-plays.',lesson:'Checks and calls can retain strong hands. Do not treat every quiet line as a weak range.',source:'https://www.pokernews.com/news/2019/03/poker-moments-erik-seidel-johnny-chan-eye-to-the-sky-33438.htm'}
];
const byId=Object.fromEntries(models.map(m=>[m.id,m]));
models.forEach(m=>P.PROFILES[m.id]={...m,name:m.person+' · inspired',legend:true});
const originalBot=P.bot,OriginalHand=P.Hand;
P.Hand=class extends OriginalHand{constructor(config,seed,fixed){const c=JSON.parse(JSON.stringify(config));c.players=c.players.map(p=>p.hero||!byId[p.profile]?p:{...p,name:byId[p.profile].alias});super(c,seed,fixed);}};
P.bot=function(v){
 const m=byId[v.profile];if(!m)return originalBot(v);
 const move=originalBot(v),l=v.legal;if(v.street===0)return move;
 const r=P.rng(v.seed^0x5177A),f=P.features(v.hole,v.board),opps=v.opponents.filter(o=>!o.folded);
 const suits=[0,0,0,0];v.board.forEach(c=>suits[P.suit(c)]++);const dry=Math.max(...suits)<3;
 const strong=f.category>=3&&!f.boardOnly;
 const raiseTo=n=>({kind:'raise',amount:Math.max(l.minRaise,Math.min(l.maxRaise,Math.round(n)))});
 // Only this view is consulted: own cards and public actions, never another hand or runout.
 if(move.kind==='raise'&&strong&&v.street<3&&dry&&r()<m.trap)return {kind:l.check?'check':'call'};
 if(m.id==='legend-ivey'&&move.kind==='raise'&&f.category<1&&!f.draw&&opps.some(o=>o.profile==='calling-station'))return {kind:l.check?'check':l.call/(v.pot+l.call)<.09?'call':'fold'};
 if(m.id==='legend-brunson'&&l.raise&&f.draw&&v.active===2&&v.street<3&&r()<.20)return raiseTo(v.currentBet+Math.max(v.bb,v.pot*.7));
 if(move.kind==='raise'&&l.raise&&l.check){
  const deepest=Math.max(0,...opps.map(o=>o.stack)),effective=Math.min(v.stack,deepest),polar=strong||f.category===0;
  if(v.street>=2&&v.active===2&&effective/v.pot>1.6&&polar&&r()<m.overbet)return raiseTo(Math.min(effective,v.pot*(1.1+r()*.35)));
  return raiseTo(Math.max(v.bb,v.pot*m.size));
 }
 return move;
};
P.Legends={models,byId,version:'1.0.0'};
if(typeof document==='undefined')return;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function set(selector,value){const el=document.querySelector(selector);if(!el)throw Error('Open Table setup before choosing a lineup.');el.value=String(value);el.dispatchEvent(new Event('change',{bubbles:true}));}
function lineup(single){set('[data-setting="seats"]',single?2:6);const ids=single?[single]:models.map(m=>m.id);ids.forEach((id,i)=>set('[data-profile="'+(i+1)+'"]',id));set('[data-setting="position"]',single?'BTN/SB':'BTN');}
function decorate(){
 const strip=document.querySelector('.preset-strip');if(!strip||document.getElementById('legends-lab'))return;
 const section=document.createElement('section');section.id='legends-lab';section.className='callout';section.style.margin='14px 0';
 section.innerHTML='<div class="eyebrow">LEGENDS LAB · STYLE SIMULATIONS</div><h3 style="margin:8px 0">Practice the contrast, not the celebrity.</h3><p class="small">Independent, fictionalized opponents inspired by public poker themes. Not endorsed, not the real players, and not professional-strength replicas. Parameter values are authored—not measured player statistics.</p><div class="row" style="margin:12px 0"><button class="primary small" id="legends-all">Seat all five legends</button><label for="legends-one" class="small">Heads-up against</label><select id="legends-one" style="max-width:210px">'+models.map(m=>'<option value="'+m.id+'">'+esc(m.person)+'</option>').join('')+'</select><button class="small" id="legends-headsup">Set heads-up table</button></div><p class="small muted">Keeps your selected format and stack settings. You can mix these profiles with ordinary opponents in the seat selectors below. Changes apply when you click Deal me in.</p><details><summary>How the five models differ</summary>'+models.map(m=>'<p class="small"><strong>'+esc(m.person+' — '+m.theme)+'</strong><br>'+esc(m.description)+' <a href="'+m.source+'" target="_blank" rel="noopener noreferrer">Inspiration source</a></p>').join('')+'</details>';
 strip.after(section);section.querySelector('#legends-all').onclick=()=>lineup();section.querySelector('#legends-headsup').onclick=()=>lineup(section.querySelector('#legends-one').value);
}
const target=document.getElementById('app');if(target){new MutationObserver(decorate).observe(target,{childList:true,subtree:true});decorate();}
})(typeof window!=='undefined'?window:globalThis);
