import {toXY,dist} from './data.js';
import {assess,gradePercent} from './accessibility.js';
const xy=p=>p.x===undefined?toXY(p):p;
const getReviewValue=(way,reviews,i)=>reviews[`${way.id}:${i}`]?.incline??reviews[String(way.id)]?.incline??way.tags?.incline??'';
export const distance2seg=(p,a,b)=>{const d=(b.x-a.x)**2+(b.z-a.z)**2;const t=Math.max(0,Math.min(1,d?((p.x-a.x)*(b.x-a.x)+(p.z-a.z)*(b.z-a.z))/d:0));const x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;return {d:Math.hypot(p.x-x,p.z-z),t,x,z};};
export function canUse(tags={},threshold=6){return assess({id:'adhoc',tags},{gradeLimit:threshold}).pass;}
export function buildGraph(data,{gradeLimit=6,minWidth=.9,reports=[],reviews={},verifiedOnly=false,excludedWayIds=[],blockedSegmentIds=[],distanceOnly=false}={}){
 const nodes=new Map(),adj=new Map(),segments=[];let skipped=0,unknown=0,verified=0;
 const excluded=new Set(excludedWayIds.map(String));
 const blockedIds=new Set(blockedSegmentIds.map(String));
 for(const way of data.ways){if(excluded.has(String(way.id)))continue;const ids=way.nodeIds||[];if(ids.length<2)continue;
  for(let i=1;i<ids.length;i++){const aId=String(ids[i-1]),bId=String(ids[i]);const p=data.nodes[aId],q=data.nodes[bId];if(!p||!q)continue;
   const A=toXY(p),B=toXY(q),d=dist(A,B);if(d<.03||d>500)continue;const a=assess(way,{gradeLimit,minWidth,reviews,verifiedOnly,segmentIndex:i});
   const edge={aId,bId,a:A,b:B,d,wayId:way.id,segmentIndex:i,segmentId:`${way.id}:${i}`,tags:way.tags||{},category:a.type,permitted:a.pass,active:false,verified:a.verified,unknown:a.unknown,reason:a.reason};segments.push(edge);
   if(!a.pass){skipped++;continue;}
   // Report points are advisory unless explicitly marked confirmed. Local confirmation is not an independent field audit.
   const blocked=reports.some(r=>r.verified&&['construction','stairs','slope','surface','other'].includes(r.type)&&distance2seg(toXY(r),A,B).d<4);
   if(blocked||blockedIds.has(edge.segmentId)){edge.reason='관리자가 연결한 차단 구간';skipped++;continue;}
   edge.active=true;nodes.set(aId,A);nodes.set(bId,B);
   for(const id of [aId,bId])if(!adj.has(id))adj.set(id,[]);
   const slope=a.incline??0;const tag=(getReviewValue(way,reviews,i)||'').trim();const signed=/^([+-]?\d+(?:\.\d+)?)\s*%$/.exec(tag);const direction=signed?Number(signed[1]):null;
   const weightAB=distanceOnly?d:d*(1+(direction===null?slope/45:Math.max(0,direction)/18)+(a.unknown?.08:0));
   const weightBA=distanceOnly?d:d*(1+(direction===null?slope/45:Math.max(0,-direction)/18)+(a.unknown?.08:0));
   adj.get(aId).push({to:bId,weight:weightAB,d,unknown:a.unknown,verified:a.verified,category:a.type,wayId:way.id,segmentId:`${way.id}:${i}`});
   adj.get(bId).push({to:aId,weight:weightBA,d,unknown:a.unknown,verified:a.verified,category:a.type,wayId:way.id,segmentId:`${way.id}:${i}`});
   if(a.unknown)unknown++;else verified++;
  }
 }
 return {data,nodes,adj,segments,skipped,unknown,verified,gradeLimit,minWidth,verifiedOnly};
}
function heap(){const q=[];return {get size(){return q.length;},push(item){let i=q.length;q.push(item);while(i>0){const j=(i-1)>>1;if(q[j].score<=item.score)break;q[i]=q[j];i=j;}q[i]=item;},pop(){const result=q[0],a=q.pop();if(q.length){let i=0;while(i*2+1<q.length){let j=i*2+1;if(j+1<q.length&&q[j+1].score<q[j].score)j++;if(a.score<=q[j].score)break;q[i]=q[j];i=j;}q[i]=a;}return result;}};}
function bestSegment(pos,graph){let best=null;for(const edge of graph.segments){if(!edge.active)continue;const p=distance2seg(pos,edge.a,edge.b);if(!best||p.d<best.distance)best={edge,...p,distance:p.d};}return best;}
export function findRoute(graph,from,to,{maxSnap=18}={}){
 const start=xy(from),end=xy(to),s=bestSegment(start,graph),e=bestSegment(end,graph);
 if(!s||!e)throw new Error(graph.verifiedOnly?'현장 확인된 연결 보행로가 아직 없어요. 탐색용 모드로 확인하거나 관리자에서 구간을 검증해 주세요.':'OSM 자료에서 통행 후보 보행로를 찾지 못했어요.');
 if(s.distance>maxSnap||e.distance>maxSnap)throw new Error('선택한 지점과 가까운 보행로가 없어요. 실제 출입구 또는 보행로 위의 지점을 선택해 주세요.');
 const adj=new Map([...graph.adj].map(([k,v])=>[k,[...v]])),coords=new Map(graph.nodes);
 const connect=(id,snap)=>{const loc={x:snap.x,z:snap.z};coords.set(id,loc);adj.set(id,[]);for(const [other,frac] of [[snap.edge.aId,snap.t],[snap.edge.bId,1-snap.t]]){const d=snap.edge.d*frac;const l={to:other,weight:d,d,unknown:snap.edge.unknown,verified:snap.edge.verified,category:snap.edge.category,wayId:snap.edge.wayId,segmentId:snap.edge.segmentId};adj.get(id).push(l);adj.get(other).push({...l,to:id});}};
 connect('!start',s);connect('!end',e);
 if(s.edge.wayId===e.edge.wayId&&s.edge.aId===e.edge.aId&&s.edge.bId===e.edge.bId){const d=s.edge.d*Math.abs(s.t-e.t);const l={to:'!end',weight:d,d,unknown:s.edge.unknown,verified:s.edge.verified,category:s.edge.category,wayId:s.edge.wayId,segmentId:s.edge.segmentId};adj.get('!start').push(l);adj.get('!end').push({...l,to:'!start'});}
 const open=heap(),g=new Map([['!start',0]]),came=new Map(),closed=new Set();open.push({id:'!start',score:dist(coords.get('!start'),coords.get('!end'))});
 while(open.size){const id=open.pop().id;if(closed.has(id))continue;if(id==='!end')break;closed.add(id);for(const link of adj.get(id)||[]){if(closed.has(link.to))continue;const candidate=g.get(id)+link.weight;if(candidate<(g.get(link.to)??Infinity)){g.set(link.to,candidate);came.set(link.to,{prev:id,link});open.push({id:link.to,score:candidate+dist(coords.get(link.to),coords.get('!end'))});}}}
 if(!came.has('!end'))throw new Error('보행로가 실제 OSM 노드로 연결되지 않았어요. 지도상으로 가까운 길도 자동 연결하지 않습니다.');
 const ids=['!end'],links=[];let cursor='!end';while(cursor!=='!start'){const t=came.get(cursor);if(!t)break;links.unshift(t.link);cursor=t.prev;ids.unshift(cursor);}
 const points=ids.map(id=>coords.get(id)).filter((p,i,arr)=>i===0||dist(p,arr[i-1])>.02);
 let length=0;for(let i=1;i<points.length;i++)length+=dist(points[i-1],points[i]);
 const usage={},distanceByType={};let unknownMeters=0,confirmedMeters=0,crossingMeters=0;
 const edgeSegments=links.map((l,i)=>{const a=coords.get(ids[i]),b=coords.get(ids[i+1]);const meters=dist(a,b);usage[l.category]=(usage[l.category]||0)+1;distanceByType[l.category]=(distanceByType[l.category]||0)+meters;if(l.unknown)unknownMeters+=meters;else confirmedMeters+=meters;if(l.category==='crossing')crossingMeters+=meters;return {a,b,meters,verified:l.verified,category:l.category,segmentId:l.segmentId,wayId:l.wayId};});
 return {points,length,unknown:links.filter(l=>l.unknown).length,verified:links.filter(l=>l.verified).length,unknownMeters,confirmedMeters,crossingMeters,edgeSegments,distanceByType,links,usage,wayIds:[...new Set(links.map(l=>l.wayId))],snappedStart:s.distance,snappedEnd:e.distance,turns:getTurns(points),surveyed:links.every(l=>l.verified)};
}
export function getTurns(points){let turns=[],at=0;for(let i=1;i<points.length-1;i++){at+=dist(points[i-1],points[i]);const a=points[i-1],b=points[i],c=points[i+1],vx=b.x-a.x,vz=b.z-a.z,wx=c.x-b.x,wz=c.z-b.z;const dot=(vx*wx+vz*wz)/(Math.hypot(vx,vz)*Math.hypot(wx,wz)||1),cross=(vx*wz-vz*wx)/(Math.hypot(vx,vz)*Math.hypot(wx,wz)||1),angle=Math.atan2(cross,dot)*180/Math.PI;if(Math.abs(angle)>35&&dist(b,c)>2)turns.push({along:at,angle,text:angle>0?'오른쪽':'왼쪽',icon:angle>0?'↱':'↰'});}return turns;}
export function atDistance(route,s){const pts=route.points;s=Math.max(0,Math.min(route.length,s));let sofar=0;for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],d=dist(a,b);if(sofar+d>=s){const t=d?(s-sofar)/d:0;return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,dx:(b.x-a.x)/(d||1),dz:(b.z-a.z)/(d||1)};}sofar+=d;}const a=pts.at(-2)||pts[0],b=pts.at(-1),d=dist(a,b)||1;return {...b,dx:(b.x-a.x)/d,dz:(b.z-a.z)/d};}
export function nearestRouteProgress(route,p){let best={d:Infinity,along:0},acc=0;for(let i=1;i<route.points.length;i++){const a=route.points[i-1],b=route.points[i],r=distance2seg(p,a,b);if(r.d<best.d)best={d:r.d,along:acc+dist(a,b)*r.t};acc+=dist(a,b);}return best;}
export function textDistance(n){return n>=1000?(n/1000).toFixed(2)+'km':Math.round(n)+'m';}
