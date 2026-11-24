import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const pathsJSON=JSON.parse(readFileSync(new URL('../data/campus_paths.json',import.meta.url)));const buildingsJSON=JSON.parse(readFileSync(new URL('../data/campus_buildings.json',import.meta.url)));
const html=readFileSync(new URL('../legacy.html',import.meta.url),'utf8');
const ids=[...html.matchAll(/\bid="([\w-]+)"/g)].map(m=>m[1]);
class FakeClassList {constructor(){this.s=new Set(['hidden']);}add(...k){k.forEach(x=>this.s.add(x));}remove(...k){k.forEach(x=>this.s.delete(x));}toggle(k,bool){if(bool===undefined)bool=!this.s.has(k);bool?this.add(k):this.remove(k);}contains(k){return this.s.has(k)}}
class FakeEl {constructor(id){this.id=id;this.classList=new FakeClassList();this.style={};this.value='';this.textContent='';this.disabled=false;this.files=[];this.callbacks={};this.children=[];this.clientWidth=1200;this.clientHeight=850;this.checked=false;}addEventListener(t,f){this.callbacks[t]=f;}replaceChildren(){this.children=[];}append(el){this.children.push(el);}setAttribute(){}getBoundingClientRect(){return {left:0,top:0,width:1200,height:850};}getContext(){return gl;}setPointerCapture(){}click(){this.onclick?.({target:this});}get firstChild(){return {set textContent(x){},textContent:''};}}
const elems=new Map(ids.map(id=>[id,new FakeEl(id)]));
elems.get('gradeRange').value='6';elems.get('speedSelect').value='3';
globalThis.document={getElementById:id=>elems.get(id)||null,createElement:t=>new FakeEl(t)};
globalThis.window={addEventListener:()=>{}};
globalThis.devicePixelRatio=1;
globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
globalThis.requestAnimationFrame=()=>{};
globalThis.fetch=async (url,opts={})=>({ok:true,status:200,json:async()=> url==='/api/cache'?{paths:true,buildings:true}:url==='/api/paths'?pathsJSON:url==='/api/buildings'?buildingsJSON:url==='/api/reports'?[]:url==='/api/reviews'?{}:{elements:[]}});
const gl=new Proxy({VERTEX_SHADER:35633,FRAGMENT_SHADER:35632,COMPILE_STATUS:35713,LINK_STATUS:35714,ARRAY_BUFFER:34962,STATIC_DRAW:35044,FLOAT:5126,DEPTH_TEST:2929,TRIANGLES:4,COLOR_BUFFER_BIT:16384,DEPTH_BUFFER_BIT:256,createShader:()=>({}),createProgram:()=>({}),createBuffer:()=>({}),getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:()=>0,getUniformLocation:()=>({})},{get:(target,key)=>target[key]??(()=>{})});
await import('../src/app-v7-legacy.js');await new Promise(r=>setTimeout(r,1200));
assert.equal(elems.get('countPaths').textContent,'928개');
assert.equal(elems.get('countBuildings').textContent,'1422개');
assert(elems.get('sourceTag').textContent.includes('OSM'));
elems.get('reviewToggle').click();assert(!elems.get('reviewModal').classList.contains('hidden'));
elems.get('wayId').value=String(pathsJSON.elements[0].id);elems.get('lookupWay').click();assert(elems.get('reviewDetail').textContent.includes(String(pathsJSON.elements[0].id)));
elems.get('editStatus').value='blocked';await elems.get('saveReview').onclick();
assert(elems.get('reviewDetail').textContent.includes('관리자 차단'));
console.log('PASS actual OSM bootstrap, admin choose way ID, block way, update renderer');
