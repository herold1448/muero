import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parseOSM,combine,toXY,toLL} from '../src/data.js';
import {buildGraph,findRoute} from '../src/routing.js';
import {findBuildingApproach} from '../src/approach.js';
import {GATE_PATH_ANCHOR} from '../src/pilot.js';

const root=new URL('../',import.meta.url),read=p=>JSON.parse(readFileSync(new URL(p,root)));
const paths=parseOSM(read('data/campus_paths.json'),{includeBuildings:false});
const buildings=parseOSM(read('data/campus_buildings.json'),{includePaths:false});
const data=combine(paths,buildings);
const graph=buildGraph(data,{excludedWayIds:['1120956407']});
const library=data.places.find(p=>p.name==='중앙도서관');
const approach=findBuildingApproach(data,graph,library,[],{});
const route=findRoute(graph,toXY(GATE_PATH_ANCHOR),approach.point,{maxSnap:18});
const coord=p=>{const v=toLL(p);return [v.lng,v.lat];};
const geojson={type:'FeatureCollection',metadata:{
 title:'MUAERO gate path candidate to Main Library perimeter',
 coordinateSystem:'EPSG:4326; longitude,latitude',
 totalLengthApproxM:Number(route.length.toFixed(2)),
 status:'unverified exploration-only; not a wheelchair-safe route',
 gateCandidateLonLat:[GATE_PATH_ANCHOR.lng,GATE_PATH_ANCHOR.lat],
 gateAnchorEvidence:'OSM way 1120956407 southern endpoint, gate position unconfirmed',
 destinationEvidence:approach.description,
 excludedOSMWayIds:[1120956407],
 osmAttribution:'© OpenStreetMap contributors, ODbL 1.0',
},features:route.edgeSegments.map((edge,index)=>({type:'Feature',id:`candidate:${index+1}`,
 geometry:{type:'LineString',coordinates:[coord(edge.a),coord(edge.b)]},
 properties:{wayId:edge.wayId,segmentId:edge.segmentId,kind:edge.category,
  approxLengthM:Number(edge.meters.toFixed(2)),verified:false,measuredSlopePct:null,
  measuredWidthM:null,curbHeightCm:null,wheelchairSafe:null,
  osmLayer:data.ways.find(x=>x.id===edge.wayId)?.tags?.layer??null,
 }}))};
const output=fileURLToPath(new URL('data/gate_library_candidate_route.geojson',root));
writeFileSync(output,JSON.stringify(geojson,null,2)+'\n');
console.log(output,route.edgeSegments.length+' segments',Math.round(route.length)+'m');
