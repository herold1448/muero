// OSM descriptions and local verification must not be confused with surveyed wheelchair safety.
export const TYPES={
 sidewalk:{label:'인도 (OSM 별도 표시)',color:'#d8c8b3',width:2.5},
 crossing:{label:'횡단 구간 (턱 미확인)',color:'#f4e9bb',width:2.6},
 pedestrian:{label:'보행자 전용',color:'#e4cdb1',width:5},
 path:{label:'보행로 (세부 미확인)',color:'#b9c5ba',width:2.2},
 stairs:{label:'계단 · 통행 제외',color:'#d88a64',width:2.3},
 shared:{label:'차량·보행자 혼용 가능',color:'#82949d',width:4.8},
 road:{label:'차도 · 기본 통행 제외',color:'#55616b',width:5.5},
 cycling:{label:'자전거/기타 도로',color:'#92a8a9',width:3},
 unknown:{label:'구분 불가',color:'#a9b2af',width:2.3}
};
const VEHICLES=new Set(['residential','service','unclassified','tertiary','tertiary_link','secondary','secondary_link','primary','primary_link','trunk','trunk_link','motorway','motorway_link','road','track']);
export function classify(tags={}){
 const h=tags.highway||'';
 if(h==='steps')return 'stairs';
 if(tags.footway==='crossing'||h==='crossing'||tags.crossing)return 'crossing';
 if(tags.footway==='sidewalk')return 'sidewalk';
 if(h==='pedestrian')return 'pedestrian';
 if(h==='footway'||h==='path')return 'path';
 if(h==='living_street')return 'shared';
 if(h==='cycleway')return 'cycling';
 if(VEHICLES.has(h))return 'road';
 return 'unknown';
}
export function getReview(way,reviews={},segmentIndex=null){const whole=reviews[String(way.id)]||{};const local=segmentIndex===null?{}:reviews[`${way.id}:${segmentIndex}`]||{};return {...whole,...local};}
export function wayType(way,reviews={},segmentIndex=null){const review=getReview(way,reviews,segmentIndex);return TYPES[review?.type] ? review.type : classify(way.tags);}
export function certainty(way,reviews={}){const r=reviews[String(way.id)];return r?.status==='field_checked'?'현장 확인 주장 (로컬 기록)':r?.status==='blocked'?'관리자 차단': 'OSM 자료만 있음 · 현장 미확인';}
export function inspectData(data,reviews={}){
 const counts=Object.fromEntries(Object.keys(TYPES).map(k=>[k,0]));let inspected=0,blocked=0, withIncline=0,withKerb=0,withWidth=0;
 for(const w of data.ways){counts[wayType(w,reviews)]++;const r=reviews[String(w.id)];if(r?.status==='field_checked')inspected++;if(r?.status==='blocked')blocked++;if(w.tags?.incline||r?.incline)withIncline++;if(w.tags?.kerb||r?.kerb)withKerb++;if(w.tags?.width||r?.width)withWidth++;}
 return {counts,inspected,blocked,withIncline,withKerb,withWidth,total:data.ways.length};
}
export function gradePercent(value){
 if(value===undefined||value===null||String(value).trim()==='')return null;
 const text=String(value).trim().toLowerCase();if(text==='up'||text==='down'||text==='yes')return null;
 const m=text.match(/^([+-]?\d+(?:\.\d+)?)\s*(%|°|deg)?$/);if(!m)return null;
 const n=Math.abs(Number(m[1]));return m[2]==='°'||m[2]==='deg'?Math.tan(n*Math.PI/180)*100:n;
}
export function assess(way,{gradeLimit=6,minWidth=.9,kerbLimitCm=2,reviews={},verifiedOnly=false,segmentIndex=null}={}){
 const t=way.tags||{},review=getReview(way,reviews,segmentIndex),type=wayType(way,reviews,segmentIndex);
 const reasons=[];if(review.status==='blocked')reasons.push('관리자 차단');
 if(type==='stairs')reasons.push('계단');
 if(['road','shared','cycling','unknown'].includes(type))reasons.push('보행 전용 경로가 확인되지 않음');
 if(['no','private'].includes(t.access)||['no','private'].includes(t.foot)||t.wheelchair==='no')reasons.push('통행 제한');
 if(t.barrier==='stile')reasons.push('통과 불가능한 장벽');
 const kerb=review.kerb??t.kerb;
 if(['raised','yes'].includes(review.kerbStart)||['raised','yes'].includes(review.kerbEnd))reasons.push('횡단 연결부의 높은 턱');
 if(['raised','yes'].includes(kerb))reasons.push('높은 턱/연석');
 const value=gradePercent(review.incline??t.incline);
 if(value!==null && value>gradeLimit)reasons.push(`기록 경사 ${value.toFixed(1)}%`);
 const width=Number(review.width??t.width);if(Number.isFinite(width)&&width>0&&width<minWidth)reasons.push(`기록 폭 ${minWidth.toFixed(1)}m 미만`);
 const kerbCm=review.kerbCm===undefined||review.kerbCm===null||review.kerbCm===''?null:Number(review.kerbCm);if(kerbCm!==null&&Number.isFinite(kerbCm)&&kerbCm>kerbLimitCm)reasons.push(`기록 턱 ${kerbCm}cm`);
 const measuredWidth=Number(review.width);const measuredSlope=gradePercent(review.incline);
 const startKerb=review.kerbStart||review.kerb||'';const endKerb=review.kerbEnd||review.kerb||'';
 const crossingVerified=type!=='crossing'||(['flush','lowered','no'].includes(startKerb)&&['flush','lowered','no'].includes(endKerb));
 const verified=review.status==='field_checked' && Boolean(review.note?.trim()) && Number.isFinite(measuredWidth)&&measuredWidth>=minWidth && measuredSlope!==null && Boolean(review.surface) && crossingVerified;
 if(verifiedOnly&&!verified)reasons.push('현장 확인 기록 없음');
 return {type,pass:reasons.length===0,verified,unknown:!verified,reason:reasons.join(' · '),incline:value,kerb:kerb||null,kerbCm,width:Number.isFinite(width)&&width>0?width:null};
}
