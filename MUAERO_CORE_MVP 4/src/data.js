export const CAMPUS={name:'전남대학교 광주 용봉캠퍼스',lat:35.1765,lng:126.9078,bbox:[35.167,126.896,35.184,126.919]};
const mLng=111195*Math.cos(CAMPUS.lat*Math.PI/180);
export const toXY=p=>({x:(p.lng-CAMPUS.lng)*mLng,z:-(p.lat-CAMPUS.lat)*111195});
export const toLL=p=>({lng:CAMPUS.lng+p.x/mLng,lat:CAMPUS.lat-p.z/111195});
export const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const isin=(p)=>p.lat>=CAMPUS.bbox[0]&&p.lat<=CAMPUS.bbox[2]&&p.lng>=CAMPUS.bbox[1]&&p.lng<=CAMPUS.bbox[3];
const uniqueName=(points)=>{const names=new Map();return points.filter(p=>{if(!p.name)return false;const k=p.name.trim();if(!k||names.has(k))return false;names.set(k,1);return true;});};
const clean=(p)=>({lat:+p.lat,lng:+(p.lon??p.lng)});
export function emptyData(){return {kind:'empty',nodes:{},ways:[],buildings:[],trees:[],places:[],source:'none'};}
export function parseOSM(json,{includePaths=true,includeBuildings=true}={}){
 if(!json||!Array.isArray(json.elements))throw new Error('Overpass Turbo의 「원본 OSM 데이터(JSON)」 파일이 아니에요.');
 const nodes={}, ways=[],buildings=[],trees=[],places=[];
 for(const e of json.elements){if(e.type!=='node'||!Number.isFinite(e.lat)||!Number.isFinite(e.lon))continue;nodes[String(e.id)]={id:String(e.id),lat:e.lat,lng:e.lon,tags:e.tags||{}};
 if(e.tags?.natural==='tree'&&isin({lat:e.lat,lng:e.lon}))trees.push({id:String(e.id),lat:e.lat,lng:e.lon});
 if(e.tags?.name&&(e.tags?.amenity||e.tags?.entrance||e.tags?.tourism))places.push({name:e.tags.name,lat:e.lat,lng:e.lon,id:String(e.id),source:'osm'});
 }
 for(const e of json.elements){if(e.type!=='way')continue;const tags=e.tags||{};let coords=[];
 if(Array.isArray(e.geometry)&&e.geometry.length>1)coords=e.geometry.map(clean);
 else if(e.nodes?.length>1)coords=e.nodes.map(id=>nodes[String(id)]).filter(Boolean).map(p=>({lat:p.lat,lng:p.lng}));
 const ids=(e.nodes||[]).map(String);
 if(coords.length>1&&ids.length!==coords.length){ // when geometry exists but node IDs are absent, synthesize unique keys
   ids.length=0;coords.forEach((_,i)=>ids.push(`${e.id}-${i}`));
 }
 coords.forEach((p,i)=>{if(!nodes[ids[i]])nodes[ids[i]]={id:ids[i],...p,tags:{}};});
 if(includePaths&&tags.highway&&coords.length>1&&isin(coords[Math.floor(coords.length/2)])){
   const allowed=/^(footway|pedestrian|path|living_street|residential|service|unclassified|steps|cycleway|track|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|trunk|trunk_link|motorway|motorway_link|road)$/.test(tags.highway);
   if(allowed)ways.push({id:String(e.id),nodeIds:ids,coords,tags});
 }
 if(includeBuildings&&(tags.building||tags['building:part'])&&coords.length>=4&&isin(coords[0])){
   buildings.push({id:String(e.id),name:tags.name||'',coords,tags});
 }
 if(tags.name&&(tags.building||tags.amenity||tags.shop||tags.leisure)){
   const lat=coords.length?coords.reduce((s,p)=>s+p.lat,0)/coords.length:e.center?.lat;
   const lng=coords.length?coords.reduce((s,p)=>s+p.lng,0)/coords.length:e.center?.lon;
   if(Number.isFinite(lat)&&Number.isFinite(lng)&&isin({lat,lng}))places.push({name:tags.name,lat,lng,id:String(e.id),source:'osm'});
 }
 }
 for(const e of json.elements){if(e.type==='relation'&&e.tags?.name&&e.center&&isin({lat:e.center.lat,lng:e.center.lon}))places.push({name:e.tags.name,lat:e.center.lat,lng:e.center.lon,id:String(e.id),source:'osm'});}
 return {kind:'osm',nodes,ways,buildings,trees,places:uniqueName(places),source:'OSM · © OpenStreetMap contributors'};
}
export function combine(a,b){const key=d=>(d||[]).map(x=>[String(x.id),x]);const ways=new Map([...key(a.ways),...key(b.ways)]),buildings=new Map([...key(a.buildings),...key(b.buildings)]),trees=new Map([...key(a.trees),...key(b.trees)]);
 return {kind:a.kind==='osm'||b.kind==='osm'?'osm':'demo',nodes:{...a.nodes,...b.nodes},ways:[...ways.values()],buildings:[...buildings.values()],trees:[...trees.values()],places:uniqueName([...(a.places||[]),...(b.places||[])]),source:(a.kind==='osm'||b.kind==='osm')?'OSM · © OpenStreetMap contributors':'시연용 가상 데이터'};}
const point=(dx,dz)=>toLL({x:dx,z:dz});
// The demo is a deliberately synthetic network near the campus centre. It is NEVER actual JNU survey data.
export function makeDemo(){const nodes={},ways=[],buildings=[],trees=[],places=[];
 const xlevels=[-185,-90,8,112,214],zlevels=[-190,-84,28,138,242];
 let ctr=0;for(let z=0;z<zlevels.length;z++)for(let x=0;x<xlevels.length;x++){let id='d'+(++ctr);nodes[id]={id,...point(xlevels[x]+Math.sin(z+x)*7,zlevels[z]+Math.cos(z-x)*5),tags:{}};}
 const id=(z,x)=>'d'+(z*5+x+1);let w=0;
 for(let z=0;z<5;z++)ways.push({id:'dw'+(++w),nodeIds:Array.from({length:5},(_,x)=>id(z,x)),tags:{highway:'footway'},coords:[]});
 for(let x=0;x<5;x++)ways.push({id:'dw'+(++w),nodeIds:Array.from({length:5},(_,z)=>id(z,x)),tags:{highway:'footway',...(x===2?{incline:'8%'}:{})},coords:[]});
 ways.push({id:'dsteps',nodeIds:[id(1,1),id(2,2)],tags:{highway:'steps'},coords:[]});
 ways.push({id:'dshort',nodeIds:[id(2,3),id(3,2)],tags:{highway:'footway'},coords:[]});
 const demoNames=['시연 A동','시연 B동','시연 C동','시연 D동','시연 E동','시연 F동','시연 G동','시연 H동','시연 I동','시연 J동','시연 K동','시연 L동'];
 for(let i=0;i<12;i++){const gx=i%4,gz=Math.floor(i/4),x=-153+gx*113,z=-146+gz*142;
 const poly=[[x-29,z-22],[x+29,z-22],[x+29,z+22],[x-29,z+22],[x-29,z-22]].map(([a,b])=>point(a,b));
 buildings.push({id:'db'+i,name:demoNames[i],coords:poly,tags:{building:'university','building:levels':String(2+i%4)}});
 const p=point(x,z);places.push({...p,name:demoNames[i],id:'db'+i,source:'demo'});
 }
 for(let i=0;i<42;i++){const x=-260+(i*83)%560,z=-255+(i*137)%540;trees.push({...point(x,z),id:'dt'+i});}
 return {kind:'demo',nodes,ways,buildings,trees,places,source:'인공 시연 모형(실제 전남대 좌표/건물 아님)'};
}
export const PATH_QUERY=`[out:json][timeout:45];(way["highway"~"^(footway|pedestrian|path|living_street|residential|service|unclassified|steps|cycleway|track)$"](35.167,126.896,35.184,126.919););out geom;`;
export const BUILDING_QUERY=`[out:json][timeout:45];(way["building"](35.167,126.896,35.184,126.919);node["natural"="tree"](35.167,126.896,35.184,126.919);node["amenity"]["name"](35.167,126.896,35.184,126.919););out geom;`;

export const ROADS_QUERY=`[out:json][timeout:45];way["highway"~"^(residential|service|unclassified|tertiary|secondary|primary|living_street|road|track)$"](35.169,126.899,35.181,126.916);out geom;`;
