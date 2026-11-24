import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseOSM,combine,toXY} from '../src/data.js';
import {GATE_PATH_ANCHOR} from '../src/pilot.js';
import {buildGraph,findRoute,atDistance,distance2seg} from '../src/routing.js';
import {findBuildingApproach} from '../src/approach.js';

const read=n=>JSON.parse(readFileSync(new URL('../data/'+n,import.meta.url)));
const pilot=read('gate_library_pilot.geojson');
const candidate=read('gate_library_candidate_route.geojson');
assert.equal(pilot.metadata.heightDatum,null);
assert.deepEqual(pilot.metadata.gateCandidateLonLat,[GATE_PATH_ANCHOR.lng,GATE_PATH_ANCHOR.lat]);
assert.equal(pilot.features.filter(x=>x.properties.kind==='building').length,49);
assert.equal(pilot.features.filter(x=>x.properties.kind==='path').length,155);
assert(pilot.features.filter(x=>x.properties.kind==='building').every(x=>x.properties.measuredHeightM===null));
const data=combine(parseOSM(read('campus_paths.json'),{includeBuildings:false}),parseOSM(read('campus_buildings.json'),{includePaths:false}));
// The camera sees vehicle lanes on the avenue, while OSM labels one line
// pedestrian. Keep the source untouched, but avoid that conflicting way in
// this pilot until a survey establishes what the way actually represents.
const graph=buildGraph(data,{excludedWayIds:['1120956407']}),library=data.places.find(x=>x.name==='중앙도서관');
const approach=findBuildingApproach(data,graph,library,[],{});
const route=findRoute(graph,toXY(GATE_PATH_ANCHOR),approach.point,{maxSnap:18});
assert(route.length>400&&route.length<1000);
assert(!route.wayIds.includes('1120956407'));
assert.equal(candidate.features.length,route.edgeSegments.length);
assert.equal(candidate.metadata.totalLengthApproxM,Number(route.length.toFixed(2)));
assert(candidate.features.every(x=>x.properties.wheelchairSafe===null&&x.properties.verified===false));
assert.equal(route.unknownMeters,route.length);
assert(route.edgeSegments.every(s=>s.category!=='stairs'&&s.category!=='road'&&s.category!=='shared'));
const buildingRings=data.buildings.map(b=>b.coords.map(toXY));
function inside(p,polygon){let hit=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
 const a=polygon[i],b=polygon[j];if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)hit=!hit;
 }return hit;}
for(const s of route.edgeSegments){
 const middle={x:(s.a.x+s.b.x)/2,z:(s.a.z+s.b.z)/2};
 assert(buildingRings.every(ring=>!inside(middle,ring)),`OSM building interior: ${s.segmentId}`);
}
for(let d=0;d<=route.length;d+=2){
 const pos=atDistance(route,d);
 assert(Math.min(...route.edgeSegments.map(s=>distance2seg(pos,s.a,s.b).d))<.02,'wheelchair left the route geometry');
}
console.log('PASS pilot source geometry and gate→library candidate',Math.round(route.length)+'m',route.edgeSegments.length+' segments; all unverified');
