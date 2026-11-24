#!/usr/bin/env python3
"""MUAERO Core MVP: local server or HTTPS reverse-proxy backend.
Source OSM stays in data/; mutable reports and photos use MUAERO_HAZARD_DIR
on a persistent volume in public mode. No claim of surveyed accessibility.
"""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit, urlencode, unquote
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
import json, os, time, sys, re, threading, tempfile, posixpath, ipaddress
from hazards import HazardStore,authorized

ROOT=Path(__file__).resolve().parent
DIR=ROOT/'data';DIR.mkdir(exist_ok=True)
STATE=Path(os.environ.get('MUAERO_STATE_DIR',os.environ.get('MUAERO_HAZARD_DIR',str(DIR))));STATE.mkdir(parents=True,exist_ok=True)
PATHS=DIR/'campus_paths.json'; BUILDINGS=DIR/'campus_buildings.json'; ROADS=DIR/'campus_roads.json'; REPORTS=STATE/'reports.json'; REVIEWS=STATE/'reviews.json'; ENTRANCES=STATE/'entrances.json'; HISTORY=STATE/'history.json'; FILE_LOCK=threading.Lock()
HAZARDS=HazardStore(Path(os.environ.get('MUAERO_HAZARD_DIR',str(STATE))))
PUBLIC=os.environ.get('MUAERO_PUBLIC')=='1'
class Limit:
 def __init__(self):self.lock=threading.Lock();self.calls={}
 def allow(self,kind,ip,count,seconds):
  key=(kind,ip);now=time.monotonic()
  with self.lock:
   recent=[t for t in self.calls.get(key,[]) if now-t<seconds]
   if len(recent)>=count:return False
   recent.append(now);self.calls[key]=recent
   if len(self.calls)>2048:self.calls={k:v for k,v in self.calls.items() if v[-1]>now-3600}
   return True
LIMIT=Limit()
MAX=20*1024*1024
BBOX='35.167,126.896,35.184,126.919'
QUERIES={
 'paths':f'[out:json][timeout:35];way["highway"~"^(footway|pedestrian|path|living_street|residential|service|unclassified|steps|cycleway|track)$"]({BBOX});out geom;',
 'buildings':f'[out:json][timeout:35];(way["building"]({BBOX});node["natural"="tree"]({BBOX});node["amenity"]["name"]({BBOX}););out geom;'
}
ENDPOINTS=('https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter')

def safe_write(path,raw):
 with FILE_LOCK:
  tmp=path.with_name(path.name+'.part')
  tmp.write_bytes(raw)
  os.replace(tmp,path)

def save_history(kind,old,new):
 with FILE_LOCK:
  try: items=json.loads(HISTORY.read_text('utf-8')) if HISTORY.exists() else []
  except Exception:items=[]
  allkeys=set(old or {})|set(new or {}) if isinstance(old,dict) and isinstance(new,dict) else set()
  for k in sorted(allkeys):
   if old.get(k)!=new.get(k):
    items.append({'timestamp':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'kind':kind,'key':k,'before':{a:('[photo omitted]' if a=='photo' else v) for a,v in (old.get(k) or {}).items()} if old.get(k) else None,'after':{a:('[photo omitted]' if a=='photo' else v) for a,v in (new.get(k) or {}).items()} if new.get(k) else None})
  items=items[-300:]
  tmp=HISTORY.with_name(HISTORY.name+'.part')
  tmp.write_text(json.dumps(items,ensure_ascii=False),encoding='utf-8')
  os.replace(tmp,HISTORY)

def validate(raw):
 if len(raw)>MAX:raise ValueError('20MB보다 큰 파일은 받을 수 없어요.')
 obj=json.loads(raw)
 if not isinstance(obj,dict) or not isinstance(obj.get('elements'),list):raise ValueError('원본 OSM JSON의 elements 배열이 필요합니다.')
 return obj

def online(kind):
 errors=[]
 for endpoint in ENDPOINTS:
  try:
   req=Request(endpoint,data=urlencode({'data':QUERIES[kind]}).encode(),headers={'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json','User-Agent':'GILON-JNU-3D-Prototype/0.5 (local user initiated Overpass query)'},method='POST')
   with urlopen(req,timeout=12) as response:raw=response.read(MAX+1)
   parsed=validate(raw)
   count=sum(e.get('type')=='way' for e in parsed['elements'])
   if kind=='paths' and count<5:raise ValueError('보행로가 5개 미만입니다.')
   dest=PATHS if kind=='paths' else BUILDINGS
   dest.write_bytes(raw)
   return {'ok':True,'type':kind,'elements':len(parsed['elements']),'source':urlsplit(endpoint).hostname}
  except (TimeoutError,HTTPError,URLError,OSError,ValueError,Exception) as e:
   errors.append(f'{urlsplit(endpoint).hostname}: {str(e)[:90]}')
 raise RuntimeError(' / '.join(errors))

class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
 def client_ip(self):
  if os.environ.get('MUAERO_TRUST_PROXY')=='1':
   candidate=self.headers.get('X-Forwarded-For','').split(',')[0].strip()
   try:return str(ipaddress.ip_address(candidate))
   except ValueError:pass
  return self.client_address[0]
 def _respond(self,status,obj):
  raw=json.dumps(obj,ensure_ascii=False).encode()
  self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(raw)));self.send_header('Cache-Control','no-store');self.end_headers()
  try:self.wfile.write(raw)
  except (BrokenPipeError,ConnectionResetError):pass
 def _get(self,fn):
  try:return json.loads(fn.read_text('utf-8')) if fn.exists() else None
  except Exception:return None
 def do_GET(self):
  path=posixpath.normpath(unquote(urlsplit(self.path).path))
  match=re.fullmatch(r'/api/hazard-photo/([0-9a-f]{32})',path)
  if match:
   try:
    if not HAZARDS.photo_public(match.group(1)):
     if PUBLIC and not LIMIT.allow('private-photo',self.client_ip(),100,900):return self._respond(429,{'error':'사진 인증 요청 횟수 초과'})
     if not authorized(self.headers):return self._respond(403,{'error':'사진은 관리자 공개 승인 후 볼 수 있습니다'})
    photo=HAZARDS.photos/(match.group(1)+'.jpg')
    if not photo.exists():return self._respond(404,{'error':'사진 없음'})
    raw=photo.read_bytes();self.send_response(200);self.send_header('Content-Type','image/jpeg');self.send_header('Content-Length',str(len(raw)));self.send_header('Cache-Control','no-store');self.end_headers();return self.wfile.write(raw)
   except (OSError,ValueError) as e:
    self.log_error('hazard photo read: %s',e);return self._respond(503,{'error':'제보 사진 저장소를 읽을 수 없습니다'})
  if path=='/api/hazards':
   try:return self._respond(200,HAZARDS.public())
   except (OSError,ValueError) as e:
    self.log_error('hazard read: %s',e);return self._respond(503,{'error':'제보 저장소를 읽을 수 없습니다'})
  if path=='/api/hazards/admin':
   if PUBLIC and not LIMIT.allow('admin',self.client_ip(),30,900):return self._respond(429,{'error':'관리자 요청 횟수 초과'})
   if not authorized(self.headers):return self._respond(403,{'error':'관리자 PIN 필요 (6자리 이상 환경변수)'})
   try:return self._respond(200,HAZARDS.read())
   except (OSError,ValueError) as e:
    self.log_error('hazard admin read: %s',e);return self._respond(503,{'error':'제보 저장소를 읽을 수 없습니다'})
  if PUBLIC and path in ('/api/reports','/api/history','/legacy.html'):
   if path=='/api/history' and authorized(self.headers):pass
   else:return self._respond(403,{'error':'공개 서버에서 사용할 수 없습니다'})
  if path in ('/data/hazards.json','/data/reports.json','/data/reviews.json','/data/entrances.json','/data/history.json') or path.startswith('/data/hazard_photos/') or path.endswith('.part'):
   return self._respond(403,{'error':'직접 파일 접근 제한'})
  if path=='/api/health':return self._respond(200,{'ok':True,'mode':'public-server' if PUBLIC else 'local-server'})
  if path=='/api/cache':return self._respond(200,{'paths':PATHS.exists(),'buildings':BUILDINGS.exists(),'roads':ROADS.exists(),'reports':REPORTS.exists(),'reviews':REVIEWS.exists()})
  if path in ('/api/paths','/api/buildings','/api/roads','/api/reports','/api/reviews','/api/entrances','/api/history'):
   f={'/api/paths':PATHS,'/api/buildings':BUILDINGS,'/api/roads':ROADS,'/api/reports':REPORTS,'/api/reviews':REVIEWS,'/api/entrances':ENTRANCES,'/api/history':HISTORY}[path];data=self._get(f)
   return self._respond(200,data if data is not None else ([] if path in ('/api/reports','/api/entrances','/api/history') else {} if path=='/api/reviews' else {'elements':[]}))
  if PUBLIC and path not in ('/','/index.html','/admin.html','/mvp.css','/data/terrain/grid.json','/data/campus_roads.json') and not (path.startswith('/src/') and path.endswith('.js')) and not (path.startswith('/vendor/') and path.endswith('.js')):
   return self._respond(404,{'error':'Not found'})
  return super().do_GET()
 def do_POST(self):
  path=self.path.split('?',1)[0]
  if path=='/api/hazards' or re.fullmatch(r'/api/hazards/[0-9a-f]{32}/review',path):
   try:
    if path=='/api/hazards' and not LIMIT.allow('report',self.client_ip(),8,3600):return self._respond(429,{'error':'시간당 제보 한도 초과'})
    size=int(self.headers.get('Content-Length','0'))
    if size<2 or size>1_200_000:raise ValueError('사진 제보 용량 한도 초과')
    item=json.loads(self.rfile.read(size))
    if path=='/api/hazards':
     record,created=HAZARDS.create(item);return self._respond(201 if created else 200,HAZARDS.public_record(record))
    if PUBLIC and not LIMIT.allow('admin',self.client_ip(),30,900):return self._respond(429,{'error':'관리자 요청 횟수 초과'})
    if not authorized(self.headers):return self._respond(403,{'error':'관리자 PIN 필요'})
    record=HAZARDS.update(path.split('/')[3],item,PATHS)
    return self._respond(200,record)
   except LookupError as e:return self._respond(404,{'error':str(e)})
   except (ValueError,TypeError,KeyError) as e:return self._respond(400,{'error':str(e)})
   except OSError as e:
    self.log_error('hazard write: %s',e);return self._respond(503,{'error':'제보 저장소 오류'})
  if PUBLIC:return self._respond(403,{'error':'공개 서버에서 관리용 API를 사용할 수 없습니다'})
  if path not in ('/api/import/paths','/api/import/buildings','/api/import/roads','/api/load/paths','/api/load/buildings','/api/reports','/api/reviews','/api/entrances'):
   return self._respond(404,{'error':'Not found'})
  if path.startswith('/api/load/'):
   try:return self._respond(200,online(path.rsplit('/',1)[-1]))
   except Exception as e:return self._respond(502,{'error':'OSM 자동 다운로드 실패. Overpass Turbo JSON 파일로 가져올 수 있어요. '+str(e)[:400]})
  try:
   size=int(self.headers.get('Content-Length','0'))
   if size<1 or size>MAX:raise ValueError('전송 용량이 너무 크거나 비어 있어요.')
   raw=self.rfile.read(size)
   if path=='/api/reviews':
    obj=json.loads(raw)
    if not isinstance(obj,dict) or len(obj)>8000:raise ValueError('검증 기록 JSON 객체 형식 오류')
    for k,r in obj.items():
     if not re.fullmatch(r'\d+(?::[1-9]\d*)?',str(k)) or not isinstance(r,dict):raise ValueError('OSM way/선분 ID 검증 오류')
     if r.get('status') not in ('unreviewed','blocked','field_checked'):raise ValueError('검증 상태 오류')
    old=self._get(REVIEWS) or {}
    safe_write(REVIEWS,raw)
    save_history('review',old,obj)
   elif path=='/api/entrances':
    obj=json.loads(raw)
    if not isinstance(obj,list) or len(obj)>1000:raise ValueError('출입구 목록 형식 오류')
    ids=set()
    for it in obj:
     if not isinstance(it,dict):raise ValueError('출입구 항목 오류')
     if not isinstance(it.get('id'),str) or len(it['id'])>90 or it['id'] in ids:raise ValueError('출입구 ID 중복/오류')
     ids.add(it['id'])
     if not (-90<=float(it.get('lat',999))<=90 and -180<=float(it.get('lng',999))<=180):raise ValueError('출입구 좌표 오류')
     if it.get('accessible') not in ('yes','no','unknown') or it.get('status') not in ('unreviewed','field_checked'):raise ValueError('출입구 검증 상태 오류')
    old=self._get(ENTRANCES) or []
    safe_write(ENTRANCES,raw)
    save_history('entrance',{i['id']:i for i in old},{i['id']:i for i in obj})
   elif path=='/api/reports':
    obj=json.loads(raw)
    if not isinstance(obj,list) or len(obj)>1000:raise ValueError('제보 목록 형식이 잘못됐어요.')
    for it in obj:
     if not isinstance(it,dict) or not (-90<=float(it.get('lat',999))<=90 and -180<=float(it.get('lng',999))<=180):raise ValueError('제보 위치 오류')
    safe_write(REPORTS,raw)
   else:
    obj=validate(raw)
    f=PATHS if path.endswith('paths') else ROADS if path.endswith('roads') else BUILDINGS
    safe_write(f,raw)
   return self._respond(200,{'saved':True,'count':len(obj) if isinstance(obj,(list,dict)) and 'elements' not in obj else len(obj['elements'])})
  except Exception as e:return self._respond(400,{'error':str(e)})

if __name__=='__main__':
 port=int(os.environ.get('PORT',os.environ.get('GILON_PORT','4173')))
 if PUBLIC:
  target=HAZARDS.data_dir.resolve()
  state=STATE.resolve()
  if len(os.environ.get('MUAERO_ADMIN_PIN',''))<12 or not os.environ.get('MUAERO_HAZARD_DIR') or target.is_relative_to(ROOT) or target.is_relative_to(Path('/tmp')) or state.is_relative_to(ROOT) or state.is_relative_to(Path('/tmp')):
   print('공개 모드: 12자 이상 관리자 PIN과 앱 폴더·/tmp 밖의 영구 디스크 MUAERO_HAZARD_DIR 필요',file=sys.stderr);sys.exit(2)
 host=os.environ.get('MUAERO_HOST','0.0.0.0' if PUBLIC else '127.0.0.1')
 try:
  with ThreadingHTTPServer((host,port),Handler) as server:
   print(f'무애로 Core MVP: {host}:{port} · {"public reverse-proxy mode" if PUBLIC else "local mode"}',flush=True)
   print('OSM 자동 다운로드는 사용자 요청 시에만 수행됩니다.',flush=True)
   server.serve_forever()
 except OSError as e:
  print('서버 시작 실패(이전 서버를 종료하세요):',e,file=sys.stderr)
  sys.exit(1)
