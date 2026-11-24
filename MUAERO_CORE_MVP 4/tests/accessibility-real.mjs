import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseOSM,combine} from '../src/data.js';
import {TYPES,assess,inspectData} from '../src/accessibility.js';
import {buildGraph,findRoute} from '../src/routing.js';
import {findBuildingApproach} from '../src/approach.js';
const a=JSON.parse(readFileSync(new URL('../data/campus_paths.json',import.meta.url)));
const b=JSON.parse(readFileSync(new URL('../data/campus_buildings.json',import.meta.url)));
const data=combine(parseOSM(a),parseOSM(b,{includePaths:false}));
const stats=inspectData(data);
assert.equal(data.ways.length,928);assert.equal(data.buildings.length,1422);
assert.equal(stats.counts.sidewalk,364);assert.equal(stats.counts.crossing,155);assert.equal(stats.counts.stairs,36);assert.equal(stats.counts.shared,12);
assert.equal(stats.withKerb,0);assert.equal(stats.withWidth,0);
const stairs=data.ways.find(w=>w.tags.highway==='steps'),mixed=data.ways.find(w=>w.tags.highway==='living_street'),cross=data.ways.find(w=>w.tags.footway==='crossing');
assert(!assess(stairs).pass);assert(!assess(mixed).pass);assert(assess(cross).pass&&!assess(cross).verified);
let graph=buildGraph(data);assert(!graph.segments.find(e=>e.category==='stairs')?.active);assert(!graph.segments.find(e=>e.category==='shared')?.active);
const start=data.places.find(p=>p.name==='경영대 2호관');const end=data.places.find(p=>p.name==='중앙도서관');
const route=findRoute(graph,findBuildingApproach(data,graph,start).point,findBuildingApproach(data,graph,end).point);
assert(route.length>200&&route.length<1500);assert.equal(route.usage.shared||0,0);assert.equal(route.usage.road||0,0);assert(route.unknown>0);assert(route.snappedEnd<=.01);
const strict=buildGraph(data,{verifiedOnly:true});assert.equal(strict.adj.size,0);assert.throws(()=>findRoute(strict,start,end));
const reviews={};const first=data.ways.find(w=>w.tags.footway==='sidewalk');reviews[first.id]={type:'sidewalk',status:'field_checked',note:'2026-11-19 현장 검증했다고 주장하는 테스트용 기록',width:'1.5',incline:'2%',surface:'concrete'};
assert(assess(first,{reviews}).verified);assert(!assess(cross,{reviews}).verified);
reviews[cross.id]={type:'crossing',status:'field_checked',note:'현장 검증 기록만 있고 턱 정보는 없는 상태',width:'2',incline:'1%',surface:'concrete'};
assert(!assess(cross,{reviews}).verified,'Crossing without curb data must not count as verified');
reviews[cross.id].kerbStart='lowered';reviews[cross.id].kerbEnd='lowered';assert(assess(cross,{reviews}).verified);

// Segment-level edits must not unintentionally remove the entire OSM way.
const multi=data.ways.find(w=>w.tags.footway==='sidewalk'&&w.nodeIds.length>=4);
const before=buildGraph(data), after=buildGraph(data,{reviews:{[`${multi.id}:1`]:{status:'blocked',type:'sidewalk'}}});
const matched=after.segments.filter(e=>e.wayId===multi.id);
assert(matched.some(e=>!e.active));assert(matched.some(e=>e.active));
assert(after.skipped===before.skipped+1);

console.log('PASS real uploaded data:',JSON.stringify(stats.counts),'route',Math.round(route.length),'m; unverified links:',route.unknown,'way IDs',route.wayIds.length);
