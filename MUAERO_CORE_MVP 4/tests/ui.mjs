import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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
globalThis.fetch=async url=>({ok:true,json:async()=>({paths:false,buildings:false}),status:200});
const gl=new Proxy({VERTEX_SHADER:35633,FRAGMENT_SHADER:35632,COMPILE_STATUS:35713,LINK_STATUS:35714,ARRAY_BUFFER:34962,STATIC_DRAW:35044,FLOAT:5126,DEPTH_TEST:2929,TRIANGLES:4,COLOR_BUFFER_BIT:16384,DEPTH_BUFFER_BIT:256,createShader:()=>({}),createProgram:()=>({}),createBuffer:()=>({}),getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:()=>0,getUniformLocation:()=>({})},{get:(target,key)=>target[key]??(()=>{})});
await import('../src/app-v7-legacy.js');await new Promise(r=>setTimeout(r,20));
assert.equal(elems.get('sourceTag').textContent,'시연용 모형');
elems.get('routeBtn').click();assert(!elems.get('playBtn').disabled);console.log('ROUTE',elems.get('distanceText').textContent);
elems.get('playBtn').click();assert(elems.get('playBtn').textContent.includes('일시정지'));
elems.get('dataToggle').click();assert(!elems.get('modalOverlay').classList.contains('hidden'));
console.log('PASS UI startup → route → 3D navigation → settings');
