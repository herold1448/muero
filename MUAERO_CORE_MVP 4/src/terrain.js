import * as THREE from '../vendor/three.module.js';
import {toXY} from './data.js';

export function validateTerrain(grid){
 if(grid?.schema!=='muaero-dem-grid-v1'||grid.unit!=='metre'||grid.vertical_exaggeration!==1||!grid.vertical_datum||!grid.source_crs||!grid.source_sha256)throw Error('DEM 출처·기준면 정보가 없습니다.');
 const {rows,cols}=grid,n=rows*cols;
 if(!Number.isInteger(rows)||!Number.isInteger(cols)||rows<2||cols<2||rows>256||cols>256)throw Error('DEM 그리드 크기 오류');
 for(const key of ['lat','lon','relative_height_m'])if(grid[key]?.length!==n||!grid[key].every(Number.isFinite))throw Error(`DEM ${key} 결측/크기 오류`);
 if(!Number.isFinite(grid.height_origin_m))throw Error('DEM 기준 높이 오류');
 return grid;
}

export class TerrainGrid{
 constructor(input){
  const g=validateTerrain(input);this.meta=g;this.rows=g.rows;this.cols=g.cols;
  this.points=g.lat.map((lat,i)=>({...toXY({lat,lng:g.lon[i]}),y:g.relative_height_m[i]}));
  const at=(r,c)=>this.points[r*this.cols+c];this.origin=at(0,0);
  this.u={x:(at(0,this.cols-1).x-this.origin.x)/(this.cols-1),z:(at(0,this.cols-1).z-this.origin.z)/(this.cols-1)};
  this.v={x:(at(this.rows-1,0).x-this.origin.x)/(this.rows-1),z:(at(this.rows-1,0).z-this.origin.z)/(this.rows-1)};
  this.det=this.u.x*this.v.z-this.u.z*this.v.x;
  if(Math.abs(this.det)<1e-4)throw Error('DEM 수평 좌표가 퇴화했습니다.');
 }
 heightAt(p){
  const dx=p.x-this.origin.x,dz=p.z-this.origin.z;
  const c=(dx*this.v.z-dz*this.v.x)/this.det,r=(dz*this.u.x-dx*this.u.z)/this.det;
  if(c<0||r<0||c>this.cols-1||r>this.rows-1)return null;
  const x=Math.min(this.cols-2,Math.floor(c)),z=Math.min(this.rows-2,Math.floor(r)),u=c-x,v=r-z;
  const h=(rr,cc)=>this.points[rr*this.cols+cc].y;
  return (1-v)*((1-u)*h(z,x)+u*h(z,x+1))+v*((1-u)*h(z+1,x)+u*h(z+1,x+1));
 }
 mesh(){
  const vertices=[],indices=[];
  for(const p of this.points)vertices.push(p.x,p.y-.02,p.z);
  for(let r=0;r<this.rows-1;r++)for(let c=0;c<this.cols-1;c++){
    const a=r*this.cols+c,b=a+1,d=a+this.cols,e=d+1;
    indices.push(a,d,b,b,d,e);
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();
  return new THREE.Mesh(geo,new THREE.MeshLambertMaterial({color:'#85a983',side:THREE.DoubleSide}));
 }
}
