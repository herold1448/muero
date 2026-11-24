import assert from 'node:assert/strict';
import {parseOSM,toXY} from '../src/data.js';
import {buildGraph,findRoute} from '../src/routing.js';
const lat=35.176,lng=126.907;
const way=(id,nodes,coords,highway,tags={})=>({type:'way',id,nodes,geometry:coords.map(([x,y])=>({lat:lat+x/111195,lon:lng+y/91000})),tags:{highway,...tags}});
const e=[way(1,[10,11],[[0,0],[0,20]],'footway'),way(2,[12,13],[[0,30],[0,50]],'footway'),way(3,[14,15],[[-15,25],[15,25]],'service')];
const data=parseOSM({elements:e});const g=buildGraph(data);
assert.equal(g.segments.filter(x=>x.category==='road'&&x.active).length,0);
assert.throws(()=>findRoute(g,data.nodes[10],data.nodes[13],{maxSnap:2}),/연결되지|보행로/);
// Even a geometrically close crossing is NOT a valid connection without shared topology.
const c=way(4,[16,17],[[-15,25],[15,25]],'footway',{footway:'crossing'});
const g2=buildGraph(parseOSM({elements:[...e,c]}));
assert.throws(()=>findRoute(g2,{lat,lng},{lat:lat,lng:lng+50/91000},{maxSnap:2}),/연결되지/);
// Known width and slope bounds differ by user setting.
const w=way(6,[30,31],[[40,0],[40,20]],'footway',{width:'1.0',incline:'8%'});
const d2=parseOSM({elements:[w]});assert.equal(buildGraph(d2,{gradeLimit:6}).segments[0].active,false);assert.equal(buildGraph(d2,{gradeLimit:10,minWidth:1.2}).segments[0].active,false);assert.equal(buildGraph(d2,{gradeLimit:10,minWidth:.9}).segments[0].active,true);
console.log('PASS no implicit crossings / road exclusion / wheelchair width and slope limits');
