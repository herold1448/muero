import {parseOSM} from './data.js';
import {buildGraph,distance2seg} from './routing.js';
import {toXY} from './data.js';
const $=id=>document.getElementById(id),states=['REPORTED','UNDER_REVIEW','VERIFIED','RESOLVED','REJECTED'];let segments=[],photoURLs=[];
const message=t=>$('message').textContent=t;
async function request(url,options={}){const r=await fetch(url,options);const j=await r.json();if(!r.ok)throw Error(j.error||`HTTP ${r.status}`);return j;}
async function load(){try{const data=await request('/api/hazards/admin',{headers:{'X-MUAERO-Admin-Pin':$('pin').value}});
 photoURLs.forEach(URL.revokeObjectURL);photoURLs=[];
 $('items').replaceChildren();if(!data.length)$('items').textContent='등록된 제보가 없습니다.';
 for(const h of [...data].reverse())show(h);message(`${data.length}건 불러옴 · PIN은 이 페이지 메모리에만 보관합니다.`);
 }catch(e){message(e.message);}}
function show(h){const box=document.createElement('section');box.className='item';const title=document.createElement('h2');title.textContent=`${h.category} · ${h.status} · ${h.reportedAt}`;box.append(title);
 const img=document.createElement('img');img.alt='관리자 검토용 장애물 사진';box.append(img);
 fetch(h.photoUrl,{headers:{'X-MUAERO-Admin-Pin':$('pin').value}}).then(r=>{if(!r.ok)throw Error('사진 접근 실패');return r.blob();}).then(blob=>{const url=URL.createObjectURL(blob);photoURLs.push(url);img.src=url;}).catch(e=>message(e.message));
 const loc=document.createElement('p');loc.textContent=`${h.lat.toFixed(6)}, ${h.lng.toFixed(6)} · ${h.description||'설명 없음'}`;box.append(loc);
 const state=document.createElement('select');for(const t of states){const opt=document.createElement('option');opt.value=t;opt.textContent=t;if(t==='REPORTED')opt.disabled=true;state.append(opt);}state.value=h.status;
 const segment=document.createElement('input');segment.placeholder='선분 ID (예: 123456:2)';segment.value=h.segmentId||'';
 const near=document.createElement('button');near.textContent='가까운 보행 선분 제안';near.onclick=()=>{const p=toXY(h),candidates=segments.map(x=>({...x,d:distance2seg(p,x.a,x.b).d})).sort((a,b)=>a.d-b.d),candidate=candidates[0];
  if(candidate&&candidate.d<=8){segment.value=candidate.segmentId;message(`가장 가까운 후보 ${candidate.segmentId} · ${candidate.d.toFixed(1)}m. 실제 장애물과 같은 길인지 현장에서 확인하세요.`);}else message('8m 이내 보행 선분이 없습니다. 위치/원본 자료를 확인해 주세요.');};
 const blocked=document.createElement('input');blocked.type='checkbox';blocked.checked=h.blocked;blocked.style.width='auto';const blockLabel=document.createElement('label');blockLabel.append(blocked,document.createTextNode(' 이 보행 선분의 실제 통행 차단 확인'));
 const photoApproved=document.createElement('input');photoApproved.type='checkbox';photoApproved.checked=h.photoApproved===true;photoApproved.style.width='auto';const photoLabel=document.createElement('label');photoLabel.append(photoApproved,document.createTextNode(' 사진 공개 승인 (얼굴·차량번호 등 확인 후)'));
 const note=document.createElement('textarea');note.placeholder='확인 날짜·방법·근거 (8자 이상)';note.value=h.reviewNote||'';
 const save=document.createElement('button');save.className='primary';save.textContent='검토 상태 저장';save.onclick=async()=>{try{const active=['VERIFIED','UNDER_REVIEW'].includes(state.value),payload={status:state.value,segmentId:segment.value.trim()||null,blocked:state.value==='VERIFIED'&&blocked.checked,photoApproved:active&&photoApproved.checked,note:note.value.trim()};
  const result=await request(`/api/hazards/${h.id}/review`,{method:'POST',headers:{'Content-Type':'application/json','X-MUAERO-Admin-Pin':$('pin').value},body:JSON.stringify(payload)});message(`${result.id} 저장됨 · ${result.status} · 경로 차단 ${result.blocked?'예':'아니요'}`);await load();
 }catch(e){message('저장 실패: '+e.message);}};
 const fields=[['상태',state],['보행 선분 ID',segment],['확인 근거',note]];for(const [label,node] of fields){const w=document.createElement('label');w.textContent=label;w.append(node);box.append(w);}box.append(near,blockLabel,photoLabel,save);$('items').append(box);}
async function setup(){try{const [obj,health]=await Promise.all([request('/api/paths'),request('/api/health')]);segments=buildGraph(parseOSM(obj,{includeBuildings:false})).segments.filter(x=>x.active);if(health.mode==='public-server')$('legacyTools').hidden=true;}catch(e){message('보행로 데이터 확인 실패: '+e.message);} $('load').onclick=load;}
setup();
