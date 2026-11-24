import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseOSM,combine,emptyData,toXY,toLL} from '../src/data.js';
import {geometryAudit,footprint} from '../src/geometry.js';
import {TerrainGrid} from '../src/terrain.js';

const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url),'utf8'));
const bs=read('../data/campus_buildings.json'),ps=read('../data/campus_paths.json');
const data=combine(parseOSM(ps,{includeBuildings:false}),parseOSM(bs,{includePaths:false}));
const exported=read('../exports/full_campus_buildings.geojson'),paths=read('../exports/full_campus_paths.geojson'),qa=read('../exports/full_campus_qa.json');
assert.equal(data.buildings.length,1422);assert.equal(data.ways.length,928);
assert.equal(exported.features.length,1422);assert.equal(paths.features.length,928);
assert.equal(new Set(exported.features.map(f=>f.id)).size,1422);
assert.equal(qa.building_membership_verified,0);assert.equal(qa.terrain_dem,null);
assert.equal(qa.motor_road_polygons,0);
assert.ok(exported.features.every(f=>f.properties.campus_membership==='boundary_unknown'&&f.properties.ground_elevation_m===null));
assert.ok(paths.features.every(f=>f.properties.width_m_measured===null&&f.properties.slope_percent_measured===null));
assert.equal(geometryAudit(data).invalidBuildings,0);
for(const building of data.buildings){
 const ring=footprint(building.coords);assert.ok(ring,`invalid ${building.id}`);
 for(const ll of [building.coords[0],building.coords[Math.floor(building.coords.length/2)]]){
  const back=toLL(toXY(ll));assert.ok(Math.abs(back.lat-ll.lat)<1e-10&&Math.abs(back.lng-ll.lng)<1e-10);
 }
}

const origin={lat:35.1765,lng:126.9078},grid={schema:'muaero-dem-grid-v1',unit:'metre',vertical_exaggeration:1,
 vertical_datum:'test datum',source_crs:'EPSG:4326',source_sha256:'synthetic-test-only',height_origin_m:50,
 rows:3,cols:3,lat:[],lon:[],relative_height_m:[]};
for(let r=0;r<3;r++)for(let c=0;c<3;c++){
 grid.lat.push(origin.lat-r*.0001);grid.lon.push(origin.lng+c*.0001);grid.relative_height_m.push(c+2*r);
}
const terrain=new TerrainGrid(grid);
assert.ok(Math.abs(terrain.heightAt(toXY({lat:origin.lat-.00005,lng:origin.lng+.00005}))-1.5)<1e-5);
assert.equal(terrain.heightAt(toXY({lat:origin.lat+.001,lng:origin.lng})),null);
assert.throws(()=>new TerrainGrid({...grid,relative_height_m:[0]}),/결측/);
const mesh=terrain.mesh();assert.equal(mesh.geometry.index.count,24);mesh.geometry.dispose();mesh.material.dispose();
console.log('PASS full-campus original IDs/coordinates/unknown flags, synthetic DEM continuity/NoData');
