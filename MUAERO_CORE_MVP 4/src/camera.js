// Camera collision uses the same OSM footprints as the rendered buildings.
// These are visual safeguards; they do not certify a path as walkable.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function insideRing(p,ring){
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];
  if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)inside=!inside;
 }
 return inside;
}
function edgeDistance(p,a,b){
 const dx=b.x-a.x,dz=b.z-a.z,t=clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);
 return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
}
export function nearBuilding(p,b,padding=.8){
 if(p.x<b.minX-padding||p.x>b.maxX+padding||p.z<b.minZ-padding||p.z>b.maxZ+padding)return false;
 if(insideRing(p,b.ring))return true;
 return b.ring.some((a,i)=>edgeDistance(p,a,b.ring[(i+1)%b.ring.length])<padding);
}
function intersectionT(a,b,c,d){
 const rx=b.x-a.x,rz=b.z-a.z,sx=d.x-c.x,sz=d.z-c.z,det=rx*sz-rz*sx;
 if(Math.abs(det)<1e-7)return null;
 const qx=c.x-a.x,qz=c.z-a.z,t=(qx*sz-qz*sx)/det,u=(qx*rz-qz*rx)/det;
 return t>=0&&t<=1&&u>=0&&u<=1?t:null;
}
export function viewBlocked(eye,target,buildings){
 const loX=Math.min(eye.x,target.x)-.6,hiX=Math.max(eye.x,target.x)+.6;
 const loZ=Math.min(eye.z,target.z)-.6,hiZ=Math.max(eye.z,target.z)+.6;
 for(const b of buildings){
  if(b.maxX<loX||b.minX>hiX||b.maxZ<loZ||b.minZ>hiZ)continue;
  if(nearBuilding(eye,b,1)&&eye.y<b.groundY+b.height+1)return true;
  if(insideRing(target,b.ring))return true;
  for(let i=0;i<b.ring.length;i++){
   const t=intersectionT(eye,target,b.ring[i],b.ring[(i+1)%b.ring.length]);
   if(t!==null&&eye.y+(target.y-eye.y)*t<b.groundY+b.height+.6)return true;
  }
 }
 return false;
}
export function cameraObstacles(buildingTriangles){
 return buildingTriangles.map(item=>{
  const xs=item.ring.map(p=>p.x),zs=item.ring.map(p=>p.z);
  return {ring:item.ring,height:item.height,groundY:item.groundY||0,
   minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)};
 });
}
export function followCamera(p,dir,groundY,buildings){
 const side={x:-dir.z,z:dir.x},target={x:p.x,y:groundY+1.45,z:p.z};
 // Prefer a natural trailing view. Move closer, sideways, then above roofs.
 for(const height of [6.7,9.5,14,22,30])for(const [distance,lateral] of [[10,0],[7,0],[5,0],[3.5,0],[9,3],[9,-3],[7,4.5],[7,-4.5],[5,5],[5,-5],[2,0],[0,0]]){
  const eye={x:p.x-dir.x*distance+side.x*lateral,y:groundY+height,z:p.z-dir.z*distance+side.z*lateral};
  if(eye.y<groundY+2.5||viewBlocked(eye,target,buildings))continue;
  return {eye,target,clear:true};
 }
 // If the OSM route passes through a mapped footprint, no camera can show
 // the chair through an opaque building. Report the conflict to the UI.
 return {eye:{x:p.x-dir.x*3,y:groundY+25,z:p.z-dir.z*3},target,clear:false};
}
