import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {CampusRenderer} from '../src/renderer.js';
import {parseOSM,combine,toXY} from '../src/data.js';
import {GATE_PATH_ANCHOR} from '../src/pilot.js';
import {buildGraph,findRoute} from '../src/routing.js';
import {findBuildingApproach} from '../src/approach.js';
import {viewBlocked} from '../src/camera.js';

const read=n=>JSON.parse(readFileSync(new URL('../data/'+n,import.meta.url)));
const data=combine(parseOSM(read('campus_paths.json'),{includeBuildings:false}),parseOSM(read('campus_buildings.json'),{includePaths:false}));
const graph=buildGraph(data,{excludedWayIds:['1120956407']}),library=data.places.find(x=>x.name==='중앙도서관');
const route=findRoute(graph,toXY(GATE_PATH_ANCHOR),findBuildingApproach(data,graph,library,[]).point,{maxSnap:18});
const r=Object.create(CampusRenderer.prototype);
for(const name of ['world','routeGroup','markerGroup','reportGroup','selectionGroup'])r[name]=new THREE.Group();
r.scene=new THREE.Scene();r.engine={setSize(){},setPixelRatio(){},render(){}};r.canvas={clientWidth:1440,clientHeight:900};
r.camera=new THREE.PerspectiveCamera(60,1,.2,4900);r.viewport={width:0,height:0};r.chair={group:new THREE.Group(),wheels:[]};
r.terrain=null;r.last=0;r.panelOcclusion=0;r.viewKey='';r.load(data);r.setRoute(route);r.setMode('follow');r.setProgress(100);
for(const {width,height,insets} of [{width:1440,height:900,insets:[110,420]},{width:390,height:844,insets:[120,380]},{width:375,height:667,insets:[105,300]}]){
 r.canvas.clientWidth=width;r.canvas.clientHeight=height;
 for(const inset of insets){
  r.setPanelOcclusion(inset);r.resetFollowCamera();r.render(inset*10);r.camera.updateMatrixWorld();
  const chair={x:r.position.x,y:1.5,z:r.position.z},screen=r.project(chair);
  assert.ok(screen&&screen.y>0&&screen.y<height-inset,`chair behind ${inset}px sheet at ${width}×${height}: ${JSON.stringify(screen)}`);
  assert.ok(r.camera.position.y>r.heightAt(r.position)+2.5);
  assert.equal(viewBlocked(r.camera.position,chair,r.cameraBuildings),false);
  assert.equal(r.route,route);assert.equal(r.traveled,100);
 }
}
console.log('PASS projected wheelchair above compact/expanded sheet at 3 viewport sizes; camera clear, progress preserved');
