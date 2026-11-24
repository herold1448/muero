import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseOSM,combine,toXY} from '../src/data.js';
import {footprint,buildingHeight} from '../src/geometry.js';
import {GATE_PATH_ANCHOR} from '../src/pilot.js';
import {buildGraph,findRoute,atDistance} from '../src/routing.js';
import {findBuildingApproach} from '../src/approach.js';
import {cameraObstacles,followCamera,viewBlocked,nearBuilding} from '../src/camera.js';

const square={ring:[{x:-12,z:-12},{x:12,z:-12},{x:12,z:12},{x:-12,z:12}],height:14,groundY:0,minX:-12,maxX:12,minZ:-12,maxZ:12};
const p={x:0,z:18},dir={x:0,z:1},target={x:0,y:1.45,z:18};
assert(viewBlocked({x:0,y:6,z:8},target,[square]),'original trailing camera enters building');
const safe=followCamera(p,dir,0,[square]);assert(safe.clear);assert(!viewBlocked(safe.eye,target,[square]));assert(!nearBuilding(safe.eye,square));
assert.equal(followCamera({x:0,z:0},dir,0,[square]).clear,false,'OSM route/building conflict is not hidden');
const read=n=>JSON.parse(readFileSync(new URL('../data/'+n,import.meta.url)));
const data=combine(parseOSM(read('campus_paths.json'),{includeBuildings:false}),parseOSM(read('campus_buildings.json'),{includePaths:false}));
const obstacles=cameraObstacles(data.buildings.map(b=>({ring:footprint(b.coords),height:buildingHeight(b.tags).metres})).filter(b=>b.ring));
const graph=buildGraph(data,{excludedWayIds:['1120956407']}),library=data.places.find(x=>x.name==='중앙도서관');
const route=findRoute(graph,toXY(GATE_PATH_ANCHOR),findBuildingApproach(data,graph,library,[]).point,{maxSnap:18});
let originalBlocked=0,correctedBlocked=0,unresolvable=0,samples=0;
for(let d=0;d<=route.length;d+=5){
 const pos=atDistance(route,d),ahead=atDistance(route,Math.min(route.length,d+1.5)),behind=atDistance(route,Math.max(0,d-1.5));
 const length=Math.hypot(ahead.x-behind.x,ahead.z-behind.z)||1,heading={x:(ahead.x-behind.x)/length,z:(ahead.z-behind.z)/length};
 const old={x:pos.x-heading.x*9,y:5.8,z:pos.z-heading.z*9},chair={x:pos.x,y:1.45,z:pos.z};
 if(viewBlocked(old,chair,obstacles))originalBlocked++;
 const next=followCamera(pos,heading,0,obstacles);if(!next.clear)unresolvable++;
 else if(viewBlocked(next.eye,chair,obstacles))correctedBlocked++;
 samples++;
}
assert.equal(correctedBlocked,0);assert.ok(originalBlocked>0,'pilot route exercises a real camera obstruction');
console.log('PASS follow camera',JSON.stringify({samples,originalBlocked,correctedBlocked,unresolvable}));
