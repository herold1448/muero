import * as THREE from '../vendor/three.module.js';
import {wayType,TYPES} from './accessibility.js';
import {toXY,dist} from './data.js';
import {atDistance} from './routing.js';
import {footprint,buildingHeight,gradeInfo,geometryAudit} from './geometry.js';
import {PILOT_BBOX,visualFacade} from './pilot.js';
import {TerrainGrid} from './terrain.js';
import {surfacePolygon,widthEvidence} from './surface.js';
import {cameraObstacles,followCamera,viewBlocked} from './camera.js';

const material=()=>new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
function tri(v,c,a,b,d,shade){const col=new THREE.Color(shade);for(const p of [a,b,d]){v.push(...p);c.push(col.r,col.g,col.b);}}
function quad(v,c,a,b,d,e,shade){tri(v,c,a,b,d,shade);tri(v,c,a,d,e,shade);}
function strip(v,c,a,b,w,y0,y1,shade){const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<.05||len>500)return;const nx=-dz/len*w/2,nz=dx/len*w/2;quad(v,c,[a.x+nx,y0,a.z+nz],[b.x+nx,y1,b.z+nz],[b.x-nx,y1,b.z-nz],[a.x-nx,y0,a.z-nz],shade);}
function ribbon(v,c,points,width,height,shade,edgeShade){
 const sides=surfacePolygon(points,width);if(!sides)return false;
 for(let i=1;i<points.length;i++){
  const l0=sides[0][i-1],l1=sides[0][i],r0=sides[1][i-1],r1=sides[1][i];
  const y0=height(points[i-1]),y1=height(points[i]);
  quad(v,c,[l0.x,y0,l0.z],[l1.x,y1,l1.z],[r1.x,y1,r1.z],[r0.x,y0,r0.z],shade);
  if(edgeShade){const lower=.12;quad(v,c,[l0.x,y0-lower,l0.z],[l1.x,y1-lower,l1.z],[l1.x,y1,l1.z],[l0.x,y0,l0.z],edgeShade);
   quad(v,c,[r0.x,y0,r0.z],[r1.x,y1,r1.z],[r1.x,y1-lower,r1.z],[r0.x,y0-lower,r0.z],edgeShade);}
 }
 return true;
}
function batch(v,c){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(c,3));geo.computeVertexNormals();const mesh=new THREE.Mesh(geo,material());mesh.frustumCulled=false;return mesh;}
function solid(geo,shade){return new THREE.Mesh(geo,new THREE.MeshLambertMaterial({color:shade,side:THREE.DoubleSide}));}
function marker(x,z,shade){const g=new THREE.Group(),pin=solid(new THREE.CylinderGeometry(.13,.13,2.2,8),shade),ball=solid(new THREE.SphereGeometry(.8,9,6),shade);pin.position.y=1.2;ball.position.y=2.5;g.add(pin,ball);g.position.set(x,0,z);return g;}
function wheelchair(){
 const g=new THREE.Group(),parts=[['#244044',new THREE.BoxGeometry(.88,.12,.76),[0,.84,0]],['#167b69',new THREE.BoxGeometry(.84,.82,.12),[0,1.25,.34]],['#64d9ab',new THREE.BoxGeometry(.60,.71,.35),[0,1.23,-.08]],['#e2b698',new THREE.SphereGeometry(.22,12,8),[0,1.83,-.1]]];
 for(const [shade,geo,p] of parts){const m=solid(geo,shade);m.position.set(...p);g.add(m);}
 const wheels=[];for(const side of [-1,1]){const wheel=new THREE.Group(),rim=solid(new THREE.TorusGeometry(.43,.055,7,20),'#19363a');rim.rotation.y=Math.PI/2;wheel.add(rim);const hub=solid(new THREE.CylinderGeometry(.1,.1,.16,10),'#c2cec7');hub.rotation.z=Math.PI/2;wheel.add(hub);wheel.position.set(side*.56,.47,0);g.add(wheel);wheels.push(wheel);const small=solid(new THREE.CylinderGeometry(.11,.11,.07,10),'#2c484b');small.rotation.z=Math.PI/2;small.position.set(side*.42,.13,-.53);g.add(small);}
 return {group:g,wheels};
}
export class CampusRenderer{
 constructor(canvas){
  this.canvas=canvas;this.engine=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});this.engine.setPixelRatio(Math.min(globalThis.window?.devicePixelRatio||1,canvas.clientWidth<700?1.5:2));this.engine.setClearColor('#b7d1cf');
  this.scene=new THREE.Scene();this.scene.fog=new THREE.Fog('#b7d1cf',800,2600);this.scene.add(new THREE.HemisphereLight('#fff7dd','#50756b',2.1));const sun=new THREE.DirectionalLight('#ffffff',2);sun.position.set(-260,540,330);this.scene.add(sun);
  this.camera=new THREE.PerspectiveCamera(60,1,.3,3600);this.world=new THREE.Group();this.routeGroup=new THREE.Group();this.markerGroup=new THREE.Group();this.reportGroup=new THREE.Group();this.draftGroup=new THREE.Group();this.selectionGroup=new THREE.Group();this.scene.add(this.world,this.routeGroup,this.markerGroup,this.reportGroup,this.draftGroup,this.selectionGroup);
  this.chair=wheelchair();this.scene.add(this.chair.group);this.chair.group.visible=false;this.mode='overview';this.start=null;this.end=null;this.distance=760;this.yaw=.3;this.pan={x:0,z:0};this.position=null;this.camEye=null;this.camLook=null;this.followYaw=null;this.route=null;this.traveled=0;this.last=0;this.drag=null;this.places=[];this.panelOcclusion=0;this.viewKey='';this.pixelRatio=0;this.viewport={width:canvas.clientWidth,height:canvas.clientHeight};this.gradeSegments=[];this._listeners();
 }
 clear(group){for(const child of [...group.children]){group.remove(child);child.traverse(obj=>{obj.geometry?.dispose();if(obj.material)(Array.isArray(obj.material)?obj.material:[obj.material]).forEach(m=>m.dispose());});}}
 setTerrain(grid){this.terrain=grid?new TerrainGrid(grid):null;if(this.data)this.load(this.data,{reports:this.lastReports||[],reviews:this.reviews||{},roads:this.roads});}
 load(data,{reports=[],reviews={},roads=null}={}){
  this.clear(this.world);this.clear(this.selectionGroup);this.buildingTriangles=[];this.buildingMesh=null;this.data=data;this.roads=roads;this.reviews=reviews;this.lastReports=reports;this.places=data.places||[];this.gradeSegments=[];
  this.terrainMesh=null;
  if(this.terrain){this.terrainMesh=this.terrain.mesh();this.world.add(this.terrainMesh);}
  else{const ground=solid(new THREE.PlaneGeometry(3000,2800),'#8daf89');ground.rotation.x=-Math.PI/2;ground.position.y=-.045;this.world.add(ground);}
  const surfaceLayers=new Map(),bv=[],bc=[];this.widthEvidenceCounts={measuredOrTagged:0,estimated:0};
  // A separately supplied OSM road snapshot is render-only: never added to the wheelchair graph.
  const knownIds=new Set(data.ways.map(w=>w.id));
  const renderWays=[...data.ways,...(roads?.ways||[]).filter(w=>!knownIds.has(w.id)&&['road','shared','cycling'].includes(wayType(w,{},null)))];
  for(const way of renderWays){const nodeMap=roads?.nodes?.[way.nodeIds[0]]&& !data.nodes[way.nodeIds[0]]?roads.nodes:data.nodes;
   const pts=way.nodeIds.map(id=>nodeMap[id]||roads?.nodes?.[id]).filter(Boolean).map(toXY);
   for(let i=1;i<pts.length;i++){
    const a=pts[i-1],b=pts[i],len=dist(a,b);if(len<.2||len>500)continue;
    const type=wayType(way,reviews,i),review=reviews[`${way.id}:${i}`]||reviews[String(way.id)]||{};
    const width=widthEvidence(way,review,type,TYPES[type]?.width||2.2),w=width.metres;
    this.widthEvidenceCounts[width.source.includes('시각화')?'estimated':'measuredOrTagged']++;
    const layer=['road','shared','cycling'].includes(type)?'carriageway':type==='crossing'?'crossing':type==='stairs'?'stairs':type==='pedestrian'?'pedestrian':type==='sidewalk'?'sidewalk':'walkway';
    if(!surfaceLayers.has(layer))surfaceLayers.set(layer,{v:[],c:[]});const {v:pv,c:pc}=surfaceLayers.get(layer);
    const offset=['road','shared','cycling'].includes(type)?.032:type==='crossing'?.052:.12;
    const grade=gradeInfo(way,reviews,i),surfaceHeight=p=>this.heightAt(p)+offset;
    const shade=type==='road'?'#565f62':type==='sidewalk'?'#d9c9b3':type==='pedestrian'?'#cfaa8d':type==='crossing'?'#777e7b':type==='stairs'?'#ab755c':TYPES[type]?.color||'#b9c5ba';
    // Each OSM segment remains independent because reviews and routing use segment IDs.
    ribbon(pv,pc,[a,b],w,surfaceHeight,shade,layer==='sidewalk'?'#9f9b87':null);
    if(grade.direction||grade.percent!==null){this.gradeSegments.push({a,b,source:grade.source,id:`${way.id}:${i}`,percent:grade.percent});
      strip(pv,pc,a,b,Math.min(.30,w*.2),surfaceHeight(a)+.014,surfaceHeight(b)+.014,grade.source.includes('관리자 현장')?'#43e5dc':'#a36bd2');}
    if(type==='crossing'&&(way.tags?.['crossing:markings']==='zebra'||way.tags?.crossing==='marked'))for(let k=.65;k<len-.2;k+=2.4){const t=k/len,u=Math.min(1,(k+1.1)/len),A={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t},B={x:a.x+(b.x-a.x)*u,z:a.z+(b.z-a.z)*u};strip(pv,pc,A,B,w*.82,surfaceHeight(A)+.025,surfaceHeight(B)+.025,'#fff8ed');}
   }
  }
  for(const [layer,{v,c}] of surfaceLayers)if(v.length){const mesh=batch(v,c);mesh.name=`surface:${layer}`;this.world.add(mesh);}
  let accepted=0;for(const b of data.buildings){const ring=footprint(b.coords);if(!ring)continue;const h=buildingHeight(b.tags).metres,minX=Math.min(...ring.map(p=>p.x)),maxX=Math.max(...ring.map(p=>p.x)),minZ=Math.min(...ring.map(p=>p.z)),maxZ=Math.max(...ring.map(p=>p.z));if((maxX-minX)*(maxZ-minZ)>80000)continue;
   const firstTriangle=bv.length/9;
   const groundY=this.heightAt({x:(minX+maxX)/2,z:(minZ+maxZ)/2});
   const style=visualFacade(b),faces=THREE.ShapeUtils.triangulateShape(ring.map(p=>new THREE.Vector2(p.x,p.z)),[]);if(faces.length!==ring.length-2)continue;
   for(const [i,j,k] of faces){const a=ring[i],c=ring[j],d=ring[k];tri(bv,bc,[a.x,groundY+h,a.z],[c.x,groundY+h,c.z],[d.x,groundY+h,d.z],style.roof);}
   const focus=!!b.name||b.coords.some(p=>p.lat>=PILOT_BBOX.south&&p.lat<=PILOT_BBOX.north&&p.lng>=PILOT_BBOX.west&&p.lng<=PILOT_BBOX.east);
   const floors=Number(b.tags?.['building:levels']);const rows=Number.isInteger(floors)&&floors>0&&floors<=12?floors:Math.max(1,Math.min(5,Math.round(h/3.3)));
   for(let i=0;i<ring.length;i++){const a=ring[i],z=ring[(i+1)%ring.length],dx=z.x-a.x,dz=z.z-a.z,length=Math.hypot(dx,dz);quad(bv,bc,[a.x,this.heightAt(a)-.03,a.z],[z.x,this.heightAt(z)-.03,z.z],[z.x,groundY+h,z.z],[a.x,groundY+h,a.z],style.wall);
    if(!focus||length<5||length>110)continue;
    const nx=dz/length*.045,nz=-dx/length*.045,n=Math.min(16,Math.floor((length-1.8)/3.8));
    // Bands mark OSM floor counts where present; visual height per floor is an estimate.
    if(Number.isInteger(floors)&&floors>1&&floors<=12)for(let row=1;row<floors;row++){
      const y=groundY+row*h/floors;quad(bv,bc,[a.x+nx,y-.10,a.z+nz],[z.x+nx,y-.10,z.z+nz],[z.x+nx,y+.10,z.z+nz],[a.x+nx,y+.10,a.z+nz],style.accent);
    }
    for(let row=0;row<rows;row++)for(let col=0;col<n;col++){
      const t=(col+1)/(n+1),half=Math.min(1.05/length,.34/(n+1)),lo=t-half,hi=t+half,y=groundY+Math.max(.65,(row+.45)*h/rows),top=groundY+Math.min(h-.35,(row+.45)*h/rows+Math.min(1.25,h/rows*.42));
      if(top<=y)continue;quad(bv,bc,[a.x+dx*lo+nx,y,a.z+dz*lo+nz],[a.x+dx*hi+nx,y,a.z+dz*hi+nz],[a.x+dx*hi+nx,top,a.z+dz*hi+nz],[a.x+dx*lo+nx,top,a.z+dz*lo+nz],style.window);
    }
   }this.buildingTriangles.push({first:firstTriangle,last:bv.length/9,building:b,ring,height:h,groundY});accepted++;
  }
  this.cameraBuildings=cameraObstacles(this.buildingTriangles);
  if(bv.length){this.buildingMesh=batch(bv,bc);this.buildingMesh.name='buildings:batched';this.world.add(this.buildingMesh);}
  for(const t of data.trees.slice(0,350)){const p=toXY(t),y=this.heightAt(p),trunk=solid(new THREE.CylinderGeometry(.16,.2,3.7,5),'#715c48'),crown=solid(new THREE.ConeGeometry(1.7,4.1,6),'#42775c');trunk.position.set(p.x,y+1.85,p.z);crown.position.set(p.x,y+5,p.z);this.world.add(trunk,crown);}
  this.audit={...geometryAudit(data),renderedBuildings:accepted,renderedPaths:data.ways.length,renderedExtraRoads:renderWays.length-data.ways.length,
              surfaceLayers:[...surfaceLayers.keys()],widthEvidence:this.widthEvidenceCounts,terrainLoaded:!!this.terrain};this.updateReports(reports);this.setRoute(null);
 }
 // No vertical datum or DEM tile has been loaded. The rendered plane is a
 // clearly labelled placeholder; incline tags never invent a physical height.
 heightAt(p){return this.terrain?.heightAt(p)??0;}
 setSelection(start,end){this.start=start;this.end=end;this.updateMarkers();}
 setRoute(route){this.route=route;this.traveled=0;this.position=route?atDistance(route,0):null;this.clear(this.routeGroup);if(route){const v=[],c=[];for(const leg of route.edgeSegments||[]){const y1=this.heightAt(leg.a)+.19,y2=this.heightAt(leg.b)+.19;strip(v,c,leg.a,leg.b,2.8,y1-.025,y2-.025,'#244844');strip(v,c,leg.a,leg.b,1.8,y1,y2,leg.verified?'#39e3a9':'#ffd06d');}if(v.length)this.routeGroup.add(batch(v,c));}this.updateMarkers();}
 setProgress(s){this.traveled=s;if(this.route)this.position=atDistance(this.route,s);}
 updateMarkers(){this.clear(this.markerGroup);const pair=this.route?[[this.route.points[0],'#267bce'],[this.route.points.at(-1),'#ffcc5e']]:[[this.start,'#267bce'],[this.end,'#ffcc5e']];for(const [p,c] of pair)if(p){const m=marker(p.x,p.z,c);m.position.y=this.heightAt(p);this.markerGroup.add(m);}}
 updateReports(reports){this.clear(this.reportGroup);for(const r of reports){if(['RESOLVED','REJECTED'].includes(r.status))continue;const p=toXY(r),m=marker(p.x,p.z,r.status==='VERIFIED'?'#da5844':'#e6a72c');m.position.y=this.heightAt(p);m.userData.report=r;this.reportGroup.add(m);}}
 setDraftReport(p){this.clear(this.draftGroup);if(!p)return;const m=marker(p.x,p.z,'#f4ae29');m.scale.setScalar(1.3);m.position.y=this.heightAt(p);this.draftGroup.add(m);}
 setSelectedBuilding(id){this.clear(this.selectionGroup);const item=this.buildingTriangles.find(t=>String(t.building.id)===String(id));if(!item)return;const y=this.heightAt(item.ring[0])+item.height+.22;
  const geometry=new THREE.BufferGeometry().setFromPoints(item.ring.map(p=>new THREE.Vector3(p.x,y,p.z)));
  this.selectionGroup.add(new THREE.LineLoop(geometry,new THREE.LineBasicMaterial({color:'#39ffe0',linewidth:2})));
 }
 setMode(mode){this.mode=mode;this.camEye=null;this.camLook=null;this.followYaw=null;}
 setPanelOcclusion(px){this.panelOcclusion=Math.max(0,Number(px)||0);}
 resetFollowCamera(){if(!this.route)return;this.setMode('follow');}
 zoom(delta){this.distance=Math.max(48,Math.min(2100,this.distance*(delta>0?.76:1.32)));}
 home(){this.pan=toXY({lat:35.1765,lng:126.9078});this.distance=1650;this.setMode('overview');}
 focusPilot(){this.pan=toXY({lat:35.1749,lng:126.9061});this.distance=550;this.setMode('overview');}
 _listeners(){const canvas=this.canvas;canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);this.drag={x:e.clientX,y:e.clientY,moved:false};});canvas.addEventListener('pointermove',e=>{if(!this.drag)return;const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;if(Math.hypot(dx,dy)>3)this.drag.moved=true;if(this.mode!=='follow'&&e.buttons){this.yaw+=dx*.005;this.distance=Math.max(50,Math.min(2100,this.distance*(1+dy*.002)));}this.drag.x=e.clientX;this.drag.y=e.clientY;});canvas.addEventListener('pointerup',e=>{const moved=this.drag?.moved;this.drag=null;if(!moved){if(!this.locationPickMode){const report=this.pickReport(e.clientX,e.clientY);if(report&&this.onReport?.(report))return;const b=this.pickBuilding(e.clientX,e.clientY);if(b&&this.onBuilding){this.onBuilding(b);return;}}if(this.onPick){const p=this.pick(e.clientX,e.clientY);if(p)this.onPick(p);}}});canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom(-e.deltaY)},{passive:false});}
 pickReport(x,y){if(!this.reportGroup?.children.length)return null;const r=this.canvas.getBoundingClientRect();if(!r.width||!r.height)return null;
  const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((x-r.left)/r.width*2-1,1-(y-r.top)/r.height*2),this.camera);
  for(const hit of ray.intersectObjects(this.reportGroup.children,true)){let item=hit.object;while(item&&!item.userData.report)item=item.parent;if(item?.userData.report)return item.userData.report;}
  // At overview zoom a one metre sphere is smaller than a finger. Keep a screen-space hit area.
  let nearest=null,delta=26;for(const item of this.reportGroup.children){const p=this.project({x:item.position.x,y:item.position.y+2.5,z:item.position.z});if(!p)continue;
   const d=Math.hypot(p.x-(x-r.left),p.y-(y-r.top));if(d<delta){delta=d;nearest=item.userData.report;}}
  return nearest;
 }
 pickBuilding(x,y){if(!this.buildingMesh)return null;const r=this.canvas.getBoundingClientRect();if(!r.width||!r.height)return null;
  const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((x-r.left)/r.width*2-1,1-(y-r.top)/r.height*2),this.camera);
  const hit=ray.intersectObject(this.buildingMesh,false)[0];if(!hit)return null;
  return this.buildingTriangles.find(item=>hit.faceIndex>=item.first&&hit.faceIndex<item.last)?.building||null;
 }
 pick(x,y){const r=this.canvas.getBoundingClientRect();if(!r.width||!r.height)return null;const xy=new THREE.Vector2((x-r.left)/r.width*2-1,1-(y-r.top)/r.height*2),ray=new THREE.Raycaster();ray.setFromCamera(xy,this.camera);
  if(this.terrainMesh){const terrain=ray.intersectObject(this.terrainMesh,false)[0];if(terrain)return {x:terrain.point.x,z:terrain.point.z};}
  const hit=new THREE.Vector3();return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),hit)?{x:hit.x,z:hit.z}:null;
 }
 render(now){const dt=Math.min(.07,(now-this.last)/1000||.016);this.last=now;const w=this.canvas.clientWidth||1,h=this.canvas.clientHeight||1;const ratio=Math.min(globalThis.window?.devicePixelRatio||1,w<700?1.5:2);if(this.pixelRatio!==ratio){this.engine.setPixelRatio(ratio);this.pixelRatio=ratio;}if(this.viewport.width!==w||this.viewport.height!==h){this.engine.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}this.viewport={width:w,height:h};let eye,look;
  if(this.mode==='follow'&&this.route&&this.position){const p=this.position,prev=atDistance(this.route,Math.max(0,this.traveled-1.5)),next=atDistance(this.route,Math.min(this.route.length,this.traveled+1.5));let dx=next.x-prev.x,dz=next.z-prev.z;const n=Math.hypot(dx,dz)||1;dx/=n;dz/=n;const target=Math.atan2(dx,dz);if(this.followYaw===null)this.followYaw=target;else{const delta=Math.atan2(Math.sin(target-this.followYaw),Math.cos(target-this.followYaw));this.followYaw+=delta*(1-Math.exp(-dt*3));}dx=Math.sin(this.followYaw);dz=Math.cos(this.followYaw);const y=this.heightAt(p);
   const cam=followCamera(p,{x:dx,z:dz},y,this.cameraBuildings||[]);eye=new THREE.Vector3(cam.eye.x,cam.eye.y,cam.eye.z);look=new THREE.Vector3(p.x+dx*2,y+1.2,p.z+dz*2);this.chair.group.rotation.y=Math.atan2(-dx,-dz);
   if(this.cameraClear!==cam.clear){this.cameraClear=cam.clear;this.onCameraConflict?.(!cam.clear);}
  }
  else if(this.mode==='bird'){const p=this.position||this.pan;eye=new THREE.Vector3(p.x+2,Math.max(30,this.distance*.62),p.z+6);look=new THREE.Vector3(p.x,0,p.z);}
  else{const p=this.position&&this.route?this.position:this.pan,d=this.distance;eye=new THREE.Vector3(p.x+Math.sin(this.yaw)*d*.64,d*.70,p.z+Math.cos(this.yaw)*d*.64);look=new THREE.Vector3(p.x,0,p.z);}
  if(!this.camEye){this.camEye=eye;this.camLook=look;}else{const k=1-Math.exp(-dt*(this.mode==='follow'?3.2:6));this.camEye.lerp(eye,k);this.camLook.lerp(look,k);
   if(this.mode==='follow'&&this.position&&viewBlocked(this.camEye,{x:this.position.x,y:this.heightAt(this.position)+1.45,z:this.position.z},this.cameraBuildings||[]))this.camEye.copy(eye);
  }
  const inset=this.mode==='follow'?Math.min(Math.round(this.panelOcclusion),Math.round(h*.52)):0,key=`${w}:${h}:${inset}`;
  if(this.viewKey!==key){if(inset)this.camera.setViewOffset(w,h+inset,0,inset,w,h);else this.camera.clearViewOffset();this.viewKey=key;}
  this.camera.position.copy(this.camEye);this.camera.lookAt(this.camLook);
  this.chair.group.visible=!!this.position;if(this.position){this.chair.group.position.set(this.position.x,.12+this.heightAt(this.position),this.position.z);if(this.mode!=='follow')this.chair.group.rotation.y=Math.atan2(-this.position.dx,-this.position.dz);for(const wheel of this.chair.wheels)wheel.rotation.x=this.traveled/.43;}
  this.engine.render(this.scene,this.camera);return dt;
 }
 project(pos){const p=new THREE.Vector3(pos.x,pos.y??1,pos.z).project(this.camera);if(p.z>1||p.z< -1||Math.abs(p.x)>1||Math.abs(p.y)>1)return null;return {x:(p.x*.5+.5)*this.viewport.width,y:(.5-p.y*.5)*this.viewport.height,w:this.camera.position.distanceTo(new THREE.Vector3(pos.x,pos.y??1,pos.z))};}
}
