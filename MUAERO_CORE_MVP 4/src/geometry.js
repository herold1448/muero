import {toXY,dist} from './data.js';

// This module owns the map geometry. Everything, including routing, uses metres
// relative to CAMPUS; elevation is an illustrative local offset, not a DEM.
export function footprint(coords){
  const points=[];
  for(const ll of coords||[]){
    if(!Number.isFinite(ll.lat)||!Number.isFinite(ll.lng))continue;
    const p=toXY(ll);
    if(!Number.isFinite(p.x)||!Number.isFinite(p.z))continue;
    if(!points.length||dist(points.at(-1),p)>.04)points.push(p);
  }
  if(points.length>2&&dist(points[0],points.at(-1))<.12)points.pop();
  if(points.length<3||points.length>240)return null;
  for(let i=0;i<points.length;i++)for(let j=i+2;j<points.length;j++){
    if(i===0&&j===points.length-1)continue;
    if(intersects(points[i],points[(i+1)%points.length],points[j],points[(j+1)%points.length]))return null;
  }
  const area=points.reduce((s,p,i)=>s+p.x*points[(i+1)%points.length].z-p.z*points[(i+1)%points.length].x,0)/2;
  if(Math.abs(area)<3)return null;
  return area>0?points:points.reverse();
}
function intersects(a,b,c,d){
  const cross=(u,v,w)=>(v.x-u.x)*(w.z-u.z)-(v.z-u.z)*(w.x-u.x);
  const ab=cross(a,b,c),abd=cross(a,b,d),cd=cross(c,d,a),cdb=cross(c,d,b);
  return ab*abd< -1e-7&&cd*cdb< -1e-7;
}
export function buildingHeight(tags={}){
  const raw=String(tags.height||'').trim();
  const m=/^(\d+(?:\.\d+)?)\s*(m|metres?|meters?)?$/i.exec(raw);
  const h=m?Number(m[1]):NaN;
  if(h>=2&&h<=180)return {metres:h,source:'OSM height 태그'};
  const levels=Number(tags['building:levels']);
  if(Number.isFinite(levels)&&levels>=1&&levels<=45)return {metres:Math.min(160,levels*3.3),source:'OSM 층수 × 3.3m 추정'};
  return {metres:10,source:'높이 미등록 · 10m 시각화 추정'};
}
export function gradeInfo(way,reviews={},index=1){
  const review=reviews[`${way.id}:${index}`]||reviews[String(way.id)]||{};
  const value=review.incline??way.tags?.incline;
  if(value==='up'||value==='down')return {percent:null,direction:value==='up'?1:-1,source:'OSM 경사 방향 · 경사율/고도 미측정'};
  const match=/^([+-]?\d+(?:\.\d+)?)\s*%?$/.exec(String(value??'').trim());
  if(!match||Math.abs(+match[1])>25)return {percent:null,source:'경사 미확인'};
  return {percent:+match[1],source:review.incline!=null?(review.status==='field_checked'?'관리자 현장 확인 기록':'관리자 입력 · 미확인'):'OSM 경사 태그 · 실측 불명'};
}
export function geometryAudit(data){
  let valid=0,invalid=0,tagged=0,estimated=0,graded=0;
  for(const b of data.buildings){if(footprint(b.coords)){valid++;if(buildingHeight(b.tags).source==='OSM height 태그')tagged++;else estimated++;}else invalid++;}
  for(const w of data.ways){const g=gradeInfo(w);if(g.percent!==null||g.direction)graded++;}
  return {validBuildings:valid,invalidBuildings:invalid,taggedHeights:tagged,estimatedHeights:estimated,gradedWays:graded};
}
