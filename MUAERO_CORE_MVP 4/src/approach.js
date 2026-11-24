/* Building approaches are map-based suggestions, NOT confirmed accessible entrances.
 * Never synthesize an entrance or a pedestrian link from a building centroid. */
import {toXY,dist} from './data.js';
import {distance2seg} from './routing.js';

export function nearestWalkable(point,graph){
 const p=point.x===undefined?toXY(point):point;
 let best=null;
 for(const edge of graph.segments){
  if(!edge.active)continue;
  const hit=distance2seg(p,edge.a,edge.b);
  if(!best || hit.d<best.distance)best={point:{x:hit.x,z:hit.z},distance:hit.d,edge};
 }
 return best;
}
function closestFootprint(data,buildingId){
 return data.buildings.find(b=>String(b.id)===String(buildingId))||null;
}
export function findBuildingApproach(data,graph,place,entrances=[],{maxDistance=45,verifiedOnly=false}={}){
 if(!place)throw new Error('건물 또는 장소를 선택해 주세요.');
 const building=closestFootprint(data,place.id);
 const records=entrances.filter(e=>String(e.buildingId)===String(place.id)&&e.accessible==='yes'&&e.status==='field_checked'&&Number.isFinite(+e.lat)&&Number.isFinite(+e.lng));
 // Surveyed entrances must be used explicitly, and never connected by a long invisible shortcut.
 const measured=records.map(e=>({e,near:nearestWalkable(e,graph)})).filter(x=>x.near&&x.near.distance<=12).sort((a,b)=>a.near.distance-b.near.distance);
 if(measured.length){const {e,near}=measured[0];return {point:near.point,kind:'entrance-record',entrance:e,snapDistance:near.distance,verifiedConnector:false,description:`현장 확인 기록 출입구 · 보행로까지 ${near.distance.toFixed(1)}m 접속 확인 필요`};}
 if(verifiedOnly)throw new Error('이 건물에는 보행로와 연결된 현장 확인 출입구가 없습니다. 검증 경로를 확정할 수 없어요.');
 // Prefer the distance to the outside FOOTPRINT over the building centroid.
 let best=null;
 if(building?.coords?.length>2){
  let poly=building.coords.map(toXY);
  if(poly.length>2&&dist(poly[0],poly.at(-1))<.01)poly=poly.slice(0,-1);
  for(const edge of graph.segments){
   if(!edge.active)continue;
   for(let i=0;i<poly.length;i++){
    const A=poly[i],B=poly[(i+1)%poly.length];
    // Segment-to-segment distance: endpoints and projected footprint vertices.
    for(const ref of [A,B]){
     const h=distance2seg(ref,edge.a,edge.b);
     if(!best||h.d<best.snapDistance)best={point:{x:h.x,z:h.z},snapDistance:h.d};
    }
    for(const ref of [edge.a,edge.b]){
     const h=distance2seg(ref,A,B);
     if(!best||h.d<best.snapDistance)best={point:{x:ref.x,z:ref.z},snapDistance:h.d};
    }
   }
  }
 }
 if(!best){const near=nearestWalkable(place,graph);if(near)best={point:near.point,snapDistance:near.distance};}
 if(!best||best.snapDistance>maxDistance)throw new Error(`이 건물 주변 ${maxDistance}m 이내에 보행로 후보가 없어요. 출입구 연결을 현장에서 확인해 주세요.`);
 return {...best,kind:'near-building',entrance:null,verifiedConnector:false,description:`건물 주변 보행로 후보 · 실제 출입구 미확인 (건물 외곽과 약 ${best.snapDistance.toFixed(1)}m)`};
}
export function entranceStatus(e){return e?.accessible==='yes'&&e?.status==='field_checked'?'현장 확인 기록':e?'접근성 미확인':'출입구 등록 없음';}
