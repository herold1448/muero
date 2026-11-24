import {parseOSM,combine,emptyData,toXY,toLL,dist} from './data.js';
import {CampusRenderer} from './renderer.js';
import {buildGraph,findRoute,textDistance} from './routing.js';
import {findBuildingApproach,nearestWalkable} from './approach.js';

const $=id=>document.getElementById(id);
const s={data:null,renderer:null,start:null,building:null,route:null,progress:0,playing:false,mode:null,
 hazards:[],reviews:{},entrances:[],reportLocation:null,draftLocation:null,photo:null,lastTime:0};
const category={parking:'불법주차',construction:'공사 구간',surface:'보도블록 파손',kerb:'높은 턱',slope:'급경사',obstruction:'통행 장애물',other:'기타'};
const status={REPORTED:'미확인 제보',UNDER_REVIEW:'확인 중',VERIFIED:'관리자 현장 확인 기록',RESOLVED:'해결 기록',REJECTED:'반려'};
function notice(msg){$('notice').textContent=msg;}
function fail(msg){$('error').textContent=msg;$('error').classList.remove('hidden');}
function updateCompact(){if(!s.route)return;$('compactDestination').textContent=s.building?.name||'목적지 건물';$('compactDistance').textContent=`남은 거리 ${textDistance(Math.max(0,s.route.length-s.progress))}`;
 $('compactRisk').textContent=s.route.unknownMeters>0?'현장 미검증 · 탐색용 후보 경로':'현장 확인 기록 · 독립 검증 전';}
function setSheetExpanded(expanded){const sheet=$('bottomSheet'),active=!!s.route;
 sheet.classList.toggle('is-collapsed',active&&!expanded);$('compactRoute').classList.toggle('hidden',!active||expanded);
 $('sheetCollapse').classList.toggle('hidden',!active||!expanded);$('sheetToggle').setAttribute('aria-expanded',String(expanded));$('sheetCollapse').setAttribute('aria-expanded',String(expanded));
 if(active&&!expanded)updateCompact();if(expanded)sheet.scrollTop=0;
}
async function json(url,options){const r=await fetch(url,options);const value=await r.json();if(!r.ok)throw Error(value.error||`HTTP ${r.status}`);return value;}
function centroid(b){const p=b.coords.slice(0,-1);return {lat:p.reduce((a,x)=>a+x.lat,0)/p.length,lng:p.reduce((a,x)=>a+x.lng,0)/p.length};}
function buildingPlace(b){return {id:b.id,name:b.name||`OSM 건물 #${b.id}`,...centroid(b)};}
function graph(verifiedOnly=false){return buildGraph(s.data,{reviews:s.reviews,verifiedOnly,distanceOnly:true,
  blockedSegmentIds:s.hazards.filter(h=>h.status==='VERIFIED'&&h.blocked&&h.segmentId).map(h=>h.segmentId)});}
function chooseBuilding(b){s.building=b;s.route=null;s.playing=false;$('stage').closest('.app').classList.remove('following');$('cameraReset').classList.add('hidden');setSheetExpanded(true);s.renderer.setSelectedBuilding(b.id);s.renderer.setRoute(null);
 $('selectedBuilding').classList.remove('hidden');$('buildingTitle').textContent=b.name||`OSM 건물 #${b.id}`;
 const entry=s.entrances.filter(e=>String(e.buildingId)===String(b.id));
 $('buildingStatus').textContent=entry.some(e=>e.accessible==='yes'&&e.status==='field_checked')?'접근 가능 출입구 현장 기록 · 연결 미확인':'출입구 접근성 미확인';
 $('destination').value=b.name||'';$('routeResult').classList.add('hidden');
 s.renderer.pan=toXY(centroid(b));s.renderer.distance=Math.min(s.renderer.distance,390);s.renderer.setMode('overview');
 s.renderer.setSelection(s.start,toXY(centroid(b)));notice('선택한 건물의 출입구는 현장 검증 전까지 확정되지 않습니다.');}
function chooseSearch(){const q=$('destination').value.trim().toLowerCase();if(!q)return notice('건물 이름을 입력해 주세요.');
 const b=s.data.buildings.find(x=>x.name?.toLowerCase()===q)||s.data.buildings.find(x=>x.name?.toLowerCase().includes(q));
 if(!b)return notice('OSM 자료에 이름이 일치하는 건물이 없습니다. 지도에서 건물을 선택해 주세요.');chooseBuilding(b);}
function setStart(p,label){s.start=p;$('startLabel').textContent=label;s.mode=null;s.renderer.setSelection(s.start,s.building?toXY(centroid(s.building)):null);
 notice('출발 위치가 지정됐습니다. 실제 보행로 연결 여부는 길찾기에서 확인합니다.');}
function getGps(forReport=false){if(!navigator.geolocation)return notice('위치 기능을 지원하지 않습니다. 지도에서 위치를 선택해 주세요.');
 navigator.geolocation.getCurrentPosition(({coords})=>{
  const ll={lat:coords.latitude,lng:coords.longitude},p=toXY(ll),accuracy=coords.accuracy;
  if(!Number.isFinite(accuracy)||accuracy>60||Math.hypot((ll.lat-35.1765)*111195,(ll.lng-126.9078)*91000)>2300){notice('GPS 오차가 크거나 캠퍼스 밖입니다. 지도에서 위치를 직접 선택해 주세요.');return;}
  if(forReport){s.reportLocation={...ll,gpsAccuracyM:accuracy};s.draftLocation=null;s.renderer.setDraftReport(null);$('reportLocation').textContent=`GPS ${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)} (±${Math.round(accuracy)}m)`;}
  else if(accuracy>35){notice(`GPS 오차 ±${Math.round(accuracy)}m입니다. 출발점으로 확정하지 않고 지도에서 수동 선택을 권합니다.`);}
  else{const near=nearestWalkable(p,graph());if(!near||near.distance>18){notice(`GPS 위치와 보행로 후보가 ${near?.distance.toFixed(1)||'많이'}m 떨어져 있습니다. 수동 출발점을 확인해 주세요.`);return;}
   setStart(p,`GPS 위치 · 오차 ±${Math.round(accuracy)}m · 보행 연결 미확인`);s.renderer.pan=p;s.renderer.distance=280;}
 },e=>notice('GPS 확인 실패: '+e.message+' · 지도에서 직접 선택할 수 있습니다.'),{enableHighAccuracy:true,timeout:10000,maximumAge:5000});}
function routeToBuilding(){if(!s.start)return notice('현재 위치 또는 지도에서 출발점을 먼저 선택해 주세요.');if(!s.building)return notice('목적지 건물을 먼저 선택해 주세요.');
 try{const g=graph(),place=buildingPlace(s.building),approach=findBuildingApproach(s.data,g,place,s.entrances),route=findRoute(g,s.start,approach.point,{maxSnap:18});
  s.route=route;s.progress=0;s.playing=false;s.renderer.setRoute(route);s.renderer.setMode('overview');
  $('routeResult').classList.remove('hidden');$('routeLabel').textContent=route.unknownMeters>0?'현장 미검증 · 탐색용 후보 경로':'현장 확인 기록 경로 · 독립 검증 전';
  $('routeDistance').textContent=textDistance(route.length);$('routeEta').textContent=`보행 약 ${Math.max(1,Math.round(route.length/65))}분 · 추정`;
  $('routeRisk').textContent=`미확인 ${textDistance(route.unknownMeters)} · 횡단 ${textDistance(route.crossingMeters)} · ${approach.description}. 계단·차도는 기본 제외되지만 실측 경사·턱·폭은 부족합니다.`;
  $('play').classList.remove('hidden');$('pause').classList.add('hidden');$('stop').classList.add('hidden');
  setSheetExpanded(true);updateCompact();
  notice('노란 경로는 미검증 구간입니다. 현장에서 통행 가능 여부를 확인하세요.');
 }catch(e){s.route=null;s.renderer.setRoute(null);$('routeResult').classList.add('hidden');notice(e.message);}}
async function refreshHazards(){try{s.hazards=await json('/api/hazards');s.renderer.updateReports(s.hazards.map(h=>({...h,verified:h.status==='VERIFIED'})));
 $('hazardCount').textContent=s.hazards.filter(h=>h.status!=='RESOLVED').length;
 if(s.route&&s.hazards.some(h=>h.status==='VERIFIED'&&h.blocked&&s.route.edgeSegments.some(e=>e.segmentId===h.segmentId))){s.playing=false;s.route=null;s.renderer.setRoute(null);$('routeResult').classList.add('hidden');$('stage').closest('.app').classList.remove('following');$('cameraReset').classList.add('hidden');setSheetExpanded(true);notice('새 차단 기록이 기존 경로에 반영됐습니다. 길찾기를 다시 실행해 주세요.');}
 }catch(e){notice('제보를 불러오지 못했습니다: '+e.message);}}
function hazardDetail(h){const root=$('hazardContent');root.replaceChildren();const div=document.createElement('div');div.className='hazard-detail';
 if(h.photoUrl){const img=document.createElement('img');img.src=h.photoUrl;img.alt=`${category[h.category]} 제보 사진`;div.append(img);}else{const p=document.createElement('p');p.textContent='사진은 관리자 검토 후 공개됩니다.';div.append(p);}
 for(const value of [`${category[h.category]} · ${status[h.status]}`,h.description||'상세 설명 없음',`위치 ${h.lat.toFixed(5)}, ${h.lng.toFixed(5)}${h.gpsAccuracyM==null?' · 위치 정확도 미확인':` · GPS ±${Math.round(h.gpsAccuracyM)}m`}`,`등록 ${h.reportedAt}`]){const p=document.createElement('p');p.textContent=value;div.append(p);}
 root.append(div);$('hazardDialog').showModal();}
function hazardList(){const root=$('hazardContent');root.replaceChildren();if(!s.hazards.length){root.textContent='아직 등록된 제보가 없습니다.';}for(const h of [...s.hazards].reverse()){
  const row=document.createElement('div');row.className='hazard-item';const btn=document.createElement('button');btn.textContent=`${category[h.category]} · ${status[h.status]} · ${h.reportedAt.slice(0,10)}`;btn.onclick=()=>hazardDetail(h);row.append(btn);root.append(row);} $('hazardDialog').showModal();}
function onMap(p){if(s.mode==='start'){s.renderer.locationPickMode=false;setStart(p,'지도에서 지정한 위치 · 보행 연결 미확인');return;}
 if(s.mode==='report'||s.mode==='report_confirm'){
  const ll=toLL(p);if(ll.lat<35.16||ll.lat>35.19||ll.lng<126.89||ll.lng>126.93)return notice('캠퍼스 주변의 위치를 선택해 주세요.');
  s.draftLocation={...ll,gpsAccuracyM:null};s.renderer.setDraftReport(p);s.mode='report_confirm';$('draftCoordinates').textContent=`${ll.lat.toFixed(6)}, ${ll.lng.toFixed(6)} · 지도 선택 위치, 정확도 미확인`;
  $('locationConfirm').classList.remove('hidden');notice('주황색 임시 핀의 위치를 확인하거나 다시 선택해 주세요.');return;
 }
 const h=s.hazards.map(x=>({...x,d:dist(p,toXY(x))})).sort((a,b)=>a.d-b.d)[0];if(h&&h.d<12)hazardDetail(h);}
async function photoData(file){if(!file||file.size>8_000_000)throw Error('사진은 8MB 이하로 선택해 주세요.');
 const bitmap=await createImageBitmap(file),scale=Math.min(1,1280/Math.max(bitmap.width,bitmap.height));
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
 for(const q of [.76,.62,.48]){const result=canvas.toDataURL('image/jpeg',q);if(result.length<950_000)return result;}
 throw Error('재인코딩 후 사진이 너무 큽니다. 작은 사진을 사용해 주세요.');}
async function submitReport(e){e.preventDefault();const button=$('submitReport');if(!s.reportLocation)return notice('장애물 위치를 GPS 또는 지도에서 선택해 주세요.');
 button.disabled=true;try{const image=await photoData($('photo').files[0]);const body={...s.reportLocation,category:$('category').value,description:$('description').value.trim(),photoBase64:image,clientReportId:crypto.randomUUID()};
  const h=await json('/api/hazards',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  $('reportDialog').close();$('reportForm').reset();$('photoPreview').classList.add('hidden');s.reportLocation=null;
  s.renderer.setDraftReport(null);s.draftLocation=null;await refreshHazards();notice('미확인 제보 핀이 공유됐습니다. 사진은 관리자 승인 후 공개되고 경로는 자동 차단되지 않습니다.');hazardDetail(s.hazards.find(x=>x.id===h.id)||h);
 }catch(err){notice('제보 실패: '+err.message);}finally{button.disabled=false;}}
function tick(t){const dt=Math.min(.08,(t-s.lastTime)/1000||.016);s.lastTime=t;
 if(s.playing&&s.route){s.progress=Math.min(s.route.length,s.progress+dt*2.2);s.renderer.setProgress(s.progress);updateCompact();if(s.progress>=s.route.length){s.playing=false;$('pause').textContent='▶ 다시 보기';notice('가상 경로 미리보기가 끝났습니다. 실제 이동 완료를 뜻하지 않습니다.');}}
 s.renderer.setPanelOcclusion($('bottomSheet').getBoundingClientRect().height+18);
 s.renderer.render(t);requestAnimationFrame(tick);}
async function boot(){try{s.renderer=new CampusRenderer($('stage'));
 const [paths,buildings,reviews,entrances]=await Promise.all([json('/api/paths'),json('/api/buildings'),json('/api/reviews'),json('/api/entrances')]);
 s.data=combine(parseOSM(paths,{includeBuildings:false}),parseOSM(buildings,{includePaths:false}));
 if(!s.data.buildings.length||!s.data.ways.length)throw Error('기본 건물과 보행로 OSM 데이터가 없습니다.');
 s.reviews=reviews;s.entrances=entrances;
 let roads=null;try{const r=await fetch('/data/campus_roads.json');if(r.ok)roads=parseOSM(await r.json(),{includeBuildings:false});}catch(err){console.warn('Optional roads:',err);}
 let terrainStatus='DEM 미확보 · 평면 기준';
 try{const r=await fetch('/data/terrain/grid.json');if(r.ok){s.renderer.setTerrain(await r.json());terrainStatus='DEM 지형 로드 · 출처는 데이터 문서 참조';}}catch(err){console.warn('DEM load:',err);terrainStatus='DEM 검증 실패 · 평면 기준';}
 $('terrainStatus').textContent=terrainStatus;
 s.renderer.load(s.data,{reviews:s.reviews,roads});if(s.renderer.audit.renderedExtraRoads)$('roadStatus').textContent=`OSM 차도 중심선 ${s.renderer.audit.renderedExtraRoads}개 · 폭/경계 추정`;
 s.renderer.focusPilot();s.renderer.onBuilding=b=>{
  if(s.mode){notice('위치 선택 중입니다. 건물 외곽이 아닌 실제 보행 공간을 눌러 주세요.');return;}
  chooseBuilding(b);
 };s.renderer.onPick=onMap;
 s.renderer.onReport=h=>{if(s.mode)return false;hazardDetail(h);return true;};
 s.renderer.onCameraConflict=conflict=>{if(conflict)notice('OSM 건물 외곽과 경로가 겹쳐 휠체어 시야를 확보할 수 없습니다. 현장 확인이 필요합니다.');};
 const list=$('buildings');for(const name of new Set(s.data.buildings.map(b=>b.name).filter(Boolean).sort())){const option=document.createElement('option');option.value=name;list.append(option);}
 await refreshHazards();requestAnimationFrame(tick);setInterval(refreshHazards,30000);
 $('searchBtn').onclick=chooseSearch;$('destination').onchange=chooseSearch;$('routeBtn').onclick=routeToBuilding;
 $('gpsBtn').onclick=()=>getGps();$('pickStart').onclick=()=>{s.mode='start';s.renderer.locationPickMode=true;notice('3D 지도에서 출발 위치를 누르세요. 건물 옆의 실제 보행 공간을 선택해 주세요.');};
 $('zoomIn').onclick=()=>s.renderer.zoom(1);$('zoomOut').onclick=()=>s.renderer.zoom(-1);$('overview').onclick=()=>s.renderer.home();
 $('cameraReset').onclick=()=>{s.renderer.resetFollowCamera();notice('휠체어 뒤 시점을 다시 맞췄습니다. 경로는 현장 미검증입니다.');};
 $('sheetToggle').onclick=()=>setSheetExpanded(true);$('sheetCollapse').onclick=()=>setSheetExpanded(false);
 $('play').onclick=()=>{if(!s.route)return;s.playing=true;s.progress=0;s.renderer.setProgress(0);s.renderer.setMode('follow');$('stage').closest('.app').classList.add('following');$('cameraReset').classList.remove('hidden');setSheetExpanded(false);$('play').classList.add('hidden');$('pause').classList.remove('hidden');$('pause').textContent='Ⅱ 일시정지';$('stop').classList.remove('hidden');};
 $('pause').onclick=()=>{s.playing=!s.playing;$('pause').textContent=s.playing?'Ⅱ 일시정지':'▶ 계속';};
 $('stop').onclick=()=>{s.playing=false;s.progress=0;s.renderer.setProgress(0);s.renderer.setMode('overview');$('stage').closest('.app').classList.remove('following');$('cameraReset').classList.add('hidden');setSheetExpanded(true);$('play').classList.remove('hidden');$('pause').classList.add('hidden');$('stop').classList.add('hidden');};
 $('reportBtn').onclick=()=>{$('reportDialog').showModal();};$('hazardListBtn').onclick=hazardList;$('reportGps').onclick=()=>getGps(true);
 $('reportMap').onclick=()=>{$('reportDialog').close();s.mode='report';s.renderer.locationPickMode=true;$('locationConfirm').classList.add('hidden');notice('3D 지도에서 장애물 위치를 선택하세요.');};
 $('confirmLocation').onclick=()=>{if(!s.draftLocation)return;s.reportLocation=s.draftLocation;s.draftLocation=null;s.mode=null;s.renderer.locationPickMode=false;$('locationConfirm').classList.add('hidden');$('reportLocation').textContent=`지도 선택 ${s.reportLocation.lat.toFixed(6)}, ${s.reportLocation.lng.toFixed(6)} · 정확도 미확인`;$('reportDialog').showModal();};
 $('reselectLocation').onclick=()=>{s.mode='report';$('locationConfirm').classList.add('hidden');notice('지도를 다시 눌러 임시 핀 위치를 변경하세요.');};
 $('cancelLocation').onclick=()=>{s.mode=null;s.draftLocation=null;s.renderer.locationPickMode=false;s.renderer.setDraftReport(null);$('locationConfirm').classList.add('hidden');$('reportDialog').showModal();notice('위치 선택을 취소했습니다.');};
 $('photo').onchange=e=>{const f=e.target.files[0];if(!f)return;const img=$('photoPreview');img.src=URL.createObjectURL(f);img.classList.remove('hidden');img.onload=()=>URL.revokeObjectURL(img.src);};
 $('reportForm').onsubmit=submitReport;for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>$(b.dataset.close).close();
}catch(e){console.error(e);fail('앱 초기화 실패: '+e.message);}}
boot();
