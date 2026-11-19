(function(root){
'use strict';
const P=root.Poker;if(!P)return;
const VERSION='3.0.0',cache=new Map(),queue=[];
let worker=null,active=null,sequence=0,noWorker=false,timer=null;
function cancelled(){const e=new Error('Analysis cancelled.');e.name='AbortError';return e;}
function publicInput(d){
 const v=d.view||{},allowed=['snapshotVersion','seat','id','name','start','hero','profile','hole','board','street','bb','sb','mode','rakePct','rakeCap','anteType','ante','pending','actedAt','position','button','n','stack','bet','total','dead','pot','currentBet','lastFullRaise','raiseCount','lastAggressor','legal','active'];
 const clean={};allowed.forEach(k=>{if(v[k]!==undefined)clean[k]=v[k];});
 clean.opponents=(v.opponents||[]).map(o=>{const p={};['seat','id','name','profile','position','start','stack','bet','total','dead','folded','lastAction'].forEach(k=>{if(o[k]!==undefined)p[k]=o[k];});return p;});
 clean.history=(v.history||[]).filter(e=>['post','fold','check','call','raise','street','return'].includes(e.kind)).map(e=>{const p={};['kind','street','seat','name','amount','total','pot','board','allIn','label'].forEach(k=>{if(e[k]!==undefined)p[k]=e[k];});return p;});
 return JSON.parse(JSON.stringify({view:clean,action:{kind:d.action.kind,amount:d.action.amount,total:d.action.total}}));
}
function remember(key,result){if(cache.size>=48)cache.delete(cache.keys().next().value);cache.set(key,result);}
function finish(error,result){clearTimeout(timer);timer=null;const job=active;active=null;if(!job)return;if(error)job.reject(error);else{remember(job.key,result);job.resolve(result);}pump();}
function fallback(){
 noWorker=true;if(worker){worker.terminate();worker=null;}clearTimeout(timer);timer=null;
 const job=active;if(!job){pump();return;}
 setTimeout(()=>{if(active!==job)return;try{const result=P.Analysis.analyzeDecision(job.decision,{...job.options,samples:Math.min(job.options.samples||192,96)});result.transport='Local calculation without a background worker';finish(null,result);}catch(error){finish(error);}},0);
}
function connect(){
 if(worker||noWorker)return;
 try{
  worker=new Worker('./analysis-worker.js?v='+VERSION);
  worker.onmessage=event=>{const message=event.data;if(!active||message.id!==active.id)return;if(message.error)finish(new Error(message.error));else finish(null,message.result);};
  worker.onerror=event=>{event.preventDefault?.();fallback();};
 }catch(_){noWorker=true;}
}
function pump(){
 if(active||!queue.length)return;active=queue.shift();connect();
 if(noWorker){fallback();return;}
 const job=active;
 timer=setTimeout(()=>{if(active!==job)return;worker?.terminate();worker=null;finish(new Error('This analysis exceeded its time budget. Try Quick analysis or a smaller custom range.'));},120000);
 worker.postMessage({id:job.id,decision:job.decision,options:job.options});
}
function analyze(decision,options={}){
 let d,key,opts;try{d=publicInput(decision);opts=JSON.parse(JSON.stringify(options));key=JSON.stringify([VERSION,d,opts]);}catch(e){return Promise.reject(e);}
 if(cache.has(key))return Promise.resolve(cache.get(key));
 const existing=[active,...queue].find(j=>j?.key===key);if(existing)return existing.promise;
 let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});queue.push({id:++sequence,key,decision:d,options:opts,promise,resolve,reject});pump();return promise;
}
function cancelPending(){clearTimeout(timer);timer=null;if(worker){worker.terminate();worker=null;}const jobs=[active,...queue];active=null;queue.length=0;jobs.forEach(j=>j?.reject(cancelled()));}
P.AnalysisClient={version:VERSION,analyze,cancelPending,clearCache:()=>cache.clear(),publicInput,get status(){return {working:!!active,queued:queue.length,cached:cache.size,worker:!noWorker};}};
})(typeof window!=='undefined'?window:globalThis);
