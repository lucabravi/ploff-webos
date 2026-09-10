(function(r,f){'use strict';var a=f();if(typeof module==='object'&&module.exports){module.exports=a;}else{r.PloffDebugCapture=a.create({root:r});}}(this,function(){
var h=Object.prototype.hasOwnProperty;
function c(v,n){v=String(v==null?'':v);return v.length>n?v.slice(0,n):v;}
function s(g,k){return !/url|token|secret|content|text|path|cookie|credential|address|settings|session/i.test(k)&&(g==='ass'||g==='debug'&&k==='label'||g==='playback'&&/^(playback|source|buffer|recovery|ready|network|native|public|subtitle|offset|pause|stream|decoder|terminal|clock|lifecycle|delivery|renderer|accepted|reason|initialReason|signal|action|seek|absolute|operation)/.test(k));}
function create(o){o=o||{};var r=o.root||{},a=false,e=[],g=0,b=null,d=null,z=0,q=0,n=o.now||function(){return r.performance&&r.performance.now?r.performance.now():Date.now();},w=o.wallNow||Date.now;
function t(){return{active:a,unbounded:true,eventCount:e.length,generation:g,startedAt:b,stoppedAt:d};}
function p(x,y,v){var j,k,u;if(!a){return false;}j={seq:++q,atMs:Math.max(0,+n()-z),category:c(x,32),event:c(y,64)};v=v||{};for(k in v){if(!h.call(v,k)||!s(x,k)){continue;}u=v[k];if(typeof u==='number'&&isFinite(u)||typeof u==='boolean'||u===null){j[k]=u;}else if(typeof u==='string'){j[k]=c(u,k==='label'?120:64);}}e.push(j);return true;}
function start(){g++;a=true;e=[];q=0;z=+n()||0;b=+w()||0;d=null;p('debug','capture-start');return true;}
function x(){var v=t();v.schema=1;v.events=JSON.parse(JSON.stringify(e));return v;}
function stop(){if(a){p('debug','capture-stop');a=false;d=+w()||0;}return x();}
return{start:start,stop:stop,status:t,isActive:function(){return a;},mark:function(l){return a?p('debug','mark',{label:c(l,120)}):false;},record:p,export:x};}
return{create:create};}));
