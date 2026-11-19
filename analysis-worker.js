/* Calculations stay in the browser. No network requests or private hand lookups. */
'use strict';
importScripts('./engine.js?v=3.0.0','./legends.js?v=3.0.0','./tournament.js?v=3.0.0','./analysis-core.js?v=3.0.0');
self.onmessage=function(event){const {id,decision,options}=event.data||{};try{const result=Poker.Analysis.analyzeDecision(decision,options||{});self.postMessage({id,result});}catch(error){self.postMessage({id,error:error?.message||String(error)});}};
