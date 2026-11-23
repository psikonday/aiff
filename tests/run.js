'use strict';
const assert=require('node:assert/strict');const fs=require('node:fs');const AI=require('../js/core.js');let checks=0;const results=[];
function test(name,fn){fn();checks++;results.push({name,status:'PASS'});console.log('PASS '+name)}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('Bayes: alert posterior equals 0.75',()=>near(AI.occupancy(.4,true),.75));
test('Bayes: clear posterior equals 1/13',()=>near(AI.occupancy(.4,false),1/13));
test('Bayes: repeated alerts yield 27/29',()=>near(AI.occupancy(.75,true),27/29));
test('Bayes: contradictory second reading yields 3/11',()=>near(AI.occupancy(.75,false),3/11));
test('Bayes: endpoints and invalid observations',()=>{near(AI.occupancy(0,true),0);near(AI.occupancy(1,false),1);assert.throws(()=>AI.occupancy(-.1,true));assert.throws(()=>AI.occupancy(.4,true,0,0));});
test('BFS: start equals target',()=>assert.equal(AI.bfs(AI.DEFAULT_GRID,[0,0],[0,0]).path.length,1));
test('BFS: avoids flagged A and reaches B in six moves',()=>{const p=AI.bfs(AI.DEFAULT_GRID,[0,0],[2,4],[[0,4]]).path;assert.equal(p.length-1,6);assert.ok(!p.some(x=>x.join(',')==='0,4'));});
test('BFS: invalid or blocked target is unreachable',()=>{assert.equal(AI.bfs(AI.DEFAULT_GRID,[0,0],[5,4]).path,null);assert.equal(AI.bfs(AI.DEFAULT_GRID,[0,0],[0,4],[[0,4]]).path,null);});
test('BFS: enclosed start returns no path',()=>{const g=AI.DEFAULT_GRID.map(r=>r.slice());g[0][1]=g[1][0]='#';assert.equal(AI.bfs(g,[0,0],[2,4]).path,null)});
test('MDP: certain free space has analytical value 28',()=>{const m=AI.solveMDP([0],[4]);assert.equal(m.decision(0,0).action,'Drive');near(m.decision(0,0).value,28);});
test('MDP: certain occupied space recommends exit',()=>{const m=AI.solveMDP([1],[4]);assert.equal(m.decision(0,1).action,'Exit');near(m.decision(0,1).value,0);});
test('MDP: free unreachable space is not a driving action',()=>assert.equal(AI.solveMDP([0],[Infinity]).decision(0,0).action,'Exit'));
test('MDP: no recheck budget removes Check action',()=>assert.ok(!('Check' in AI.solveMDP([.75],[4]).decision(0,.75,0).q)));
test('MDP: all alerts make information worth buying',()=>{const m=AI.plan(AI.DEFAULT_GRID,[.75,.75,.75]);assert.equal(m.action,'Check');assert.equal(m.spot,0);assert.ok(m.model.converged);});
test('MDP: full Bellman sweep is a fixed point',()=>{const m=AI.solveMDP([.75,1/13,1/13],[4,6,8]);for(let i=0;i<3;i++)for(let b=0;b<=100;b++)for(let k=0;k<=1;k++){let d=m.decision(i,b/100,k);near(d.value,Math.max(...Object.values(d.q)));}assert.ok(m.residual<1e-9);});
test('Integration: all eight initial signal combinations',()=>{for(let mask=0;mask<8;mask++){let p=[0,1,2].map(i=>AI.occupancy(.4,!!(mask&(1<<i)))),r=AI.plan(AI.DEFAULT_GRID,p);if(mask===7)assert.equal(r.action,'Check');else{let i=p.findIndex(x=>x<.5);assert.equal(r.spot,i);assert.equal(r.action,'Drive');assert.equal(r.route.length-1,[4,6,8][i]);}}});
let safetyScenarios=0;
test('Safety: 152 prior/signal scenarios never cross a blocked cell',()=>{for(let prior=5;prior<=95;prior+=5)for(let mask=0;mask<8;mask++){const p=[0,1,2].map(i=>AI.occupancy(prior/100,!!(mask&(1<<i)))),r=AI.plan(AI.DEFAULT_GRID,p);assert.ok(r.model.converged);safetyScenarios++;if(!r.route)continue;assert.ok(p[r.spot]<.5);for(let j=0;j<r.route.length;j++){const [row,col]=r.route[j];assert.notEqual(AI.DEFAULT_GRID[row][col],'#');for(let i=0;i<3;i++)if(p[i]>=.5)assert.notDeepEqual(r.route[j],AI.SPOTS[i]);if(j)assert.equal(Math.abs(row-r.route[j-1][0])+Math.abs(col-r.route[j-1][1]),1);}}});
// Independent shortest-distance oracle: repeated relaxation, not a BFS queue.
function distanceOracle(g,target,blocked){let d=Array.from({length:5},()=>Array(5).fill(Infinity));d[0][0]=0;for(let t=0;t<25;t++)for(let r=0;r<5;r++)for(let c=0;c<5;c++){if(g[r][c]==='#'||blocked.some(p=>p[0]===r&&p[1]===c))continue;for(const [dr,dc] of [[0,1],[1,0],[0,-1],[-1,0]]){let nr=r+dr,nc=c+dc;if(nr>=0&&nr<5&&nc>=0&&nc<5&&g[nr][nc]!=='#'&&!blocked.some(p=>p[0]===nr&&p[1]===nc))d[nr][nc]=Math.min(d[nr][nc],d[r][c]+1);}}return d[target[0]][target[1]]}
let seed=12345;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
test('BFS: matches independent shortest-distance oracle on 100 maps',()=>{for(let k=0;k<100;k++){let g=AI.DEFAULT_GRID.map(row=>row.map(v=>v==='.'&&random()<.25?'#':v));let blocked=AI.SPOTS.filter(()=>random()<.5);for(const t of AI.SPOTS){let result=AI.bfs(g,[0,0],t,blocked);let expected=blocked.some(x=>x.join()===t.join())?Infinity:distanceOracle(g,t,blocked);assert.equal(result.path?result.path.length-1:Infinity,expected)}}});
test('Recheck: a clear reading can enable a safe route',()=>{let p=[.75,.75,.75];p[0]=AI.occupancy(p[0],false);let r=AI.plan(AI.DEFAULT_GRID,p,[0,1,1],0);assert.equal(r.action,'Drive');assert.equal(r.spot,0);assert.equal(r.route.length-1,4);});
test('Recheck: repeated alerts never lead into likely occupied cells',()=>{let p=[.75,.75,.75],budget=[1,1,1],start=0;for(let step=0;step<4;step++){let r=AI.plan(AI.DEFAULT_GRID,p,budget,start);assert.notEqual(r.action,'Drive');if(r.action==='Exit')return;assert.equal(r.action,'Check');p[r.spot]=AI.occupancy(p[r.spot],true);budget[r.spot]=0;start=r.spot;}assert.fail('Did not terminate');});
const summary={checks,passed:checks,failed:0,safetyScenarios,randomMaps:100,shortestPathComparisons:300,seed:12345,results};fs.writeFileSync('docs/test-results.json',JSON.stringify(summary,null,2));console.log(`\n${checks}/${checks} tests passed; ${safetyScenarios} safety scenarios; 300 shortest-path comparisons.`);
