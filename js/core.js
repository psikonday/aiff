/* Pure, dependency-free AI algorithms. Shared by the website and Node tests. */
(function(root){
'use strict';
const DEFAULT_GRID=[['S','.','.','.','P'],['.','#','#','.','.'],['.','.','.','.','P'],['.','.','#','#','.'],['.','.','.','.','P']];
const SPOTS=[[0,4],[2,4],[4,4]];
const CONFIG={sensitivity:.9,falsePositive:.2,discount:.95,successReward:30,failureReward:-20,stepCost:.5,checkCost:1,skipCost:.5,bins:100,tolerance:1e-9,maxIterations:1000};
function occupancy(prior,alert,sensitivity=.9,falsePositive=.2){
 if(![prior,sensitivity,falsePositive].every(x=>Number.isFinite(x)&&x>=0&&x<=1))throw Error('Probabilities must be between 0 and 1.');
 const a=alert?sensitivity:1-sensitivity,b=alert?falsePositive:1-falsePositive,den=a*prior+b*(1-prior);
 if(den===0)throw Error('This observation has zero probability under the model.');
 return a*prior/den;
}
function bfs(grid,start,target,blocked=[]){
 const rows=grid.length,cols=grid[0]?.length||0;
 if(!rows||grid.some(r=>r.length!==cols))throw Error('Map must be rectangular.');
 const key=([r,c])=>r+','+c,inside=([r,c])=>Number.isInteger(r)&&Number.isInteger(c)&&r>=0&&r<rows&&c>=0&&c<cols;
 const closed=new Set(blocked.map(key));
 if(!inside(start)||!inside(target)||closed.has(key(start))||closed.has(key(target))||grid[start[0]][start[1]]==='#'||grid[target[0]][target[1]]==='#')return {path:null,visited:0};
 const queue=[start],parent=new Map([[key(start),null]]);let head=0;
 while(head<queue.length){const cell=queue[head++], [r,c]=cell;
  if(key(cell)===key(target)){const path=[];let cur=cell;while(cur){path.push(cur);cur=parent.get(key(cur));}return {path:path.reverse(),visited:head};}
  for(const [dr,dc] of [[0,1],[1,0],[0,-1],[-1,0]]){const next=[r+dr,c+dc],k=key(next);if(inside(next)&&grid[next[0]][next[1]]!=='#'&&!closed.has(k)&&!parent.has(k)){parent.set(k,cell);queue.push(next);}}
 }
 return {path:null,visited:head};
}
/* Finite belief-state MDP: candidate i, rounded occupancy b/100, one recheck budget k.
   Bayes supplies the transition probabilities for a new observation.
   Planning is approximate because beliefs are discretized to 101 values. */
function solveMDP(probabilities,distances,options={}){
 const cfg={...CONFIG,...options},n=probabilities.length,B=cfg.bins;
 if(n!==distances.length||probabilities.some(p=>!Number.isFinite(p)||p<0||p>1))throw Error('Invalid candidate inputs.');
 if(!(cfg.discount>=0&&cfg.discount<1)||!Number.isInteger(B)||B<1)throw Error('Invalid MDP configuration.');
 const bin=p=>Math.min(B,Math.max(0,Math.round(p*B))),index=(i,b,k)=>(i*(B+1)+b)*2+k;
 const count=n*(B+1)*2;let values=new Float64Array(count),iterations=0,delta=Infinity;
 function actions(i,b,k,V){const p=b/B,next=i+1<n?V[index(i+1,bin(probabilities[i+1]),1)]:0;
  const q={Exit:0,Skip:-cfg.skipCost+cfg.discount*next};
  // Conservative driving rule: never plan to drive into a likely occupied space.
  if(p<.5&&Number.isFinite(distances[i]))q.Drive=-cfg.stepCost*distances[i]+(1-p)*cfg.successReward+p*(cfg.failureReward+cfg.discount*next);
  if(k>0&&Number.isFinite(distances[i])){const pa=cfg.sensitivity*p+cfg.falsePositive*(1-p);let expectation=0;
   if(pa>0)expectation+=pa*V[index(i,bin(occupancy(p,true,cfg.sensitivity,cfg.falsePositive)),k-1)];
   if(pa<1)expectation+=(1-pa)*V[index(i,bin(occupancy(p,false,cfg.sensitivity,cfg.falsePositive)),k-1)];
   q.Check=-cfg.checkCost+cfg.discount*expectation;
  }
  return q;
 }
 while(iterations<cfg.maxIterations&&delta>cfg.tolerance){const nextValues=new Float64Array(count);delta=0;
  for(let i=0;i<n;i++)for(let b=0;b<=B;b++)for(let k=0;k<=1;k++){const id=index(i,b,k);nextValues[id]=Math.max(...Object.values(actions(i,b,k,values)));delta=Math.max(delta,Math.abs(nextValues[id]-values[id]));}
  values=nextValues;iterations++;
 }
 function decision(i,p,k=1){const q=actions(i,bin(p),k,values);const action=Object.keys(q).reduce((best,a)=>q[a]>q[best]+1e-10?a:best,'Exit');return {action,q,value:values[index(i,bin(p),k)],belief:bin(p)/B};}
 return {decision,iterations,residual:delta,converged:delta<=cfg.tolerance,stateCount:count,config:cfg};
}
function plan(grid,probabilities,budgets=[1,1,1],startIndex=0){
 const routes=SPOTS.map((target,i)=>bfs(grid,[0,0],target,SPOTS.filter((s,j)=>j!==i&&probabilities[j]>=.5)));
 const distances=routes.map(r=>r.path?r.path.length-1:Infinity),model=solveMDP(probabilities,distances),trace=[];
 for(let i=startIndex;i<SPOTS.length;i++){const d=model.decision(i,probabilities[i],budgets[i]);trace.push({spot:i,...d});if(d.action==='Skip')continue;return {spot:i,...d,route:d.action==='Drive'?routes[i].path:null,routes,distances,model,trace};}
 return {spot:-1,action:'Exit',route:null,routes,distances,model,trace};
}
const api={DEFAULT_GRID,SPOTS,CONFIG,occupancy,bfs,solveMDP,plan};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ParkingAI=api;
})(typeof globalThis!=='undefined'?globalThis:this);
