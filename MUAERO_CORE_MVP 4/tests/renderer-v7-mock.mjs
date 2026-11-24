import assert from 'node:assert/strict';
import {CampusRenderer} from '../src/renderer-v7-legacy.js';
import {makeDemo} from '../src/data.js';
import {buildGraph,findRoute} from '../src/routing.js';
import {findBuildingApproach} from '../src/approach.js';
const log=[];
const gl=new Proxy({
 VERTEX_SHADER:35633,FRAGMENT_SHADER:35632,COMPILE_STATUS:35713,LINK_STATUS:35714,
 ARRAY_BUFFER:34962,STATIC_DRAW:35044,FLOAT:5126,DEPTH_TEST:2929,TRIANGLES:4,COLOR_BUFFER_BIT:16384,DEPTH_BUFFER_BIT:256,
 createShader:()=>({}),createProgram:()=>({}),createBuffer:()=>({}),getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:()=>0,getUniformLocation:()=>({}),
 bufferData:(type,data)=>{assert(data instanceof Float32Array);assert(data.length<5000000);},drawArrays:(type,first,count)=>{assert(count>0);log.push(count);}
 },{get(target,key){return target[key]??(()=>{});}});
const canvas={clientWidth:1280,clientHeight:800,getContext:()=>gl,addEventListener:()=>{}};
globalThis.devicePixelRatio=1;
const renderer=new CampusRenderer(canvas);
const demo=makeDemo();renderer.load(demo);
assert(renderer.meshes.ground?.count>0);
const graph=buildGraph(demo);const route=findRoute(graph,findBuildingApproach(demo,graph,demo.places[0]).point,findBuildingApproach(demo,graph,demo.places.at(-1)).point);renderer.setRoute(route);
renderer.setMode('follow');renderer.setProgress(route.length/2);renderer.render(1000);
assert(log.length>=4);const p=renderer.project({x:0,z:0,y:4});assert(p===null||Number.isFinite(p.x));
renderer.setMode('overview');renderer.render(1016);
console.log('PASS geometry + route + WebGL draw calls',log.length,'meshes; static vertices',renderer.meshes.ground.count);
