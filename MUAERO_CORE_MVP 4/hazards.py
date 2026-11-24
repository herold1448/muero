"""Local MVP hazard store. Client images are JPEG re-encodes with EXIF removed."""
from pathlib import Path
import base64
import hmac
import json
import math
import os
import re
import threading
import time
import uuid

KINDS={'parking','construction','surface','kerb','slope','obstruction','other'}
STATES={'REPORTED','UNDER_REVIEW','VERIFIED','RESOLVED','REJECTED'}
LOCK=threading.Lock()


def now():return time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())


def jpeg_size(raw):
 """Check JPEG marker structure and dimensions before saving browser re-encodes."""
 i=2;dimensions=None
 while i<len(raw)-2:
  if raw[i]!=0xff:raise ValueError('JPEG 마커 구조 오류')
  while i<len(raw) and raw[i]==0xff:i+=1
  if i>=len(raw):break
  marker=raw[i];i+=1
  if marker==0xda:break
  if marker in (0xd8,0xd9) or 0xd0<=marker<=0xd7:continue
  if i+2>len(raw):raise ValueError('JPEG 길이 오류')
  length=int.from_bytes(raw[i:i+2],'big')
  if length<2 or i+length>len(raw):raise ValueError('JPEG 길이 오류')
  if marker==0xe1:raise ValueError('APP1/EXIF 메타데이터 사진은 받을 수 없습니다')
  if marker in (0xc0,0xc1,0xc2) and length>=7:
   dimensions=(int.from_bytes(raw[i+3:i+5],'big'),int.from_bytes(raw[i+5:i+7],'big'))
  i+=length
 if not dimensions or not (1<=dimensions[0]<=4096 and 1<=dimensions[1]<=4096):raise ValueError('JPEG 이미지 크기/구조 오류')
 return dimensions


class HazardStore:
 def __init__(self, data_dir):
  self.data_dir=Path(data_dir);self.path=self.data_dir/'hazards.json';self.photos=self.data_dir/'hazard_photos'
  self.photos.mkdir(parents=True,exist_ok=True)

 def read(self):
  try:
   result=json.loads(self.path.read_text('utf-8'))
   if not isinstance(result,list):raise ValueError('제보 저장 형식 오류: 원본 보존을 위해 저장 중단')
   return result
  except FileNotFoundError:return []

 def write(self, items):
  tmp=self.path.with_suffix('.json.part')
  tmp.write_text(json.dumps(items,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
  os.replace(tmp,self.path)

 def public(self):
  return [self.public_record(x) for x in self.read() if x['status'] not in ('REJECTED','RESOLVED')]

 @staticmethod
 def public_record(record):
  fields=('id','lat','lng','category','description','gpsAccuracyM','status','segmentId','blocked','reportedAt','reviewedAt','verificationSource')
  return {**{key:record.get(key) for key in fields},'photoUrl':record.get('photoUrl') if record.get('photoApproved') is True else None}

 def photo_public(self,ident):
  return any(x.get('id')==ident and x.get('photoApproved') is True and x.get('status') not in ('REJECTED','RESOLVED') for x in self.read())

 def create(self, item):
  if not isinstance(item,dict):raise ValueError('제보 형식 오류')
  lat,lng=item.get('lat'),item.get('lng')
  if not isinstance(lat,(int,float)) or not isinstance(lng,(int,float)) or not math.isfinite(lat) or not math.isfinite(lng) or not (35.16<=lat<=35.19 and 126.89<=lng<=126.93):raise ValueError('용봉캠퍼스 주변 좌표 필요')
  if item.get('category') not in KINDS:raise ValueError('장애물 유형 오류')
  desc=item.get('description','')
  if not isinstance(desc,str) or len(desc)>500:raise ValueError('설명 길이 오류')
  image=item.get('photoBase64')
  if not isinstance(image,str) or not image.startswith('data:image/jpeg;base64,'):raise ValueError('EXIF 제거된 JPEG 사진 필요')
  try:photo=base64.b64decode(image.split(',',1)[1],validate=True)
  except (ValueError,base64.binascii.Error):raise ValueError('사진 인코딩 오류')
  if len(photo)<200 or len(photo)>750_000 or not photo.startswith(b'\xff\xd8\xff') or not photo.endswith(b'\xff\xd9'):raise ValueError('JPEG 크기/내용 오류 (750KB 이하)')
  if b'Exif\x00\x00' in photo:raise ValueError('EXIF 메타데이터가 포함된 사진은 받을 수 없습니다')
  jpeg_size(photo)
  accuracy=item.get('gpsAccuracyM')
  if accuracy is not None and (not isinstance(accuracy,(int,float)) or not math.isfinite(accuracy) or accuracy<0 or accuracy>10000):raise ValueError('GPS 오차값 오류')
  client=item.get('clientReportId')
  if client is not None and (not isinstance(client,str) or not re.fullmatch('[a-zA-Z0-9_-]{8,64}',client)):raise ValueError('제보 식별자 오류')
  with LOCK:
   items=self.read()
   if client:
    duplicate=next((x for x in items if x.get('clientReportId')==client),None)
    if duplicate:return duplicate,False
   if len(items)>=1000:raise ValueError('제보 저장 한도 초과')
   ident=uuid.uuid4().hex;path=self.photos/(ident+'.jpg')
   path.write_bytes(photo)
   record={'id':ident,'lat':lat,'lng':lng,'category':item['category'],
           'description':desc.strip(),'photoUrl':f'/api/hazard-photo/{ident}',
           'gpsAccuracyM':accuracy,'clientReportId':client,'status':'REPORTED',
           'segmentId':None,'blocked':False,'reportedAt':now(),'reviewedAt':None,
           'reviewNote':None,'verificationSource':'none','photoApproved':False,'history':[]}
   try:self.write(items+[record])
   except Exception:path.unlink(missing_ok=True);raise
   return record,True

 def update(self,ident,changes,source_paths):
  if not isinstance(changes,dict) or changes.get('status') not in STATES or changes['status']=='REPORTED':raise ValueError('관리 상태 오류')
  status=changes['status'];note=changes.get('note','')
  if not isinstance(note,str) or len(note)<8 or len(note)>500:raise ValueError('현장 확인 근거를 8–500자로 기록')
  segment=changes.get('segmentId')
  if segment is not None and (not isinstance(segment,str) or not re.fullmatch(r'\d+:[1-9]\d*',segment)):raise ValueError('선분 ID 형식 오류')
  blocked=changes.get('blocked') is True
  approved=changes.get('photoApproved') is True
  if approved and status not in ('VERIFIED','UNDER_REVIEW'):raise ValueError('검토 중이거나 검증된 사진만 공개 승인 가능')
  if blocked and (status!='VERIFIED' or not segment):raise ValueError('검증 및 연결된 선분만 차단 가능')
  with LOCK:
   items=self.read();record=next((x for x in items if x['id']==ident),None)
   if not record:raise LookupError('제보를 찾을 수 없습니다')
   if segment and not segment_near_report(source_paths,segment,record):raise ValueError('제보 위치에서 8m 이내의 기존 보행 선분 ID가 아닙니다')
   record.setdefault('history',[]).append({'at':now(),'from':record['status'],'to':status,'segmentId':segment,'blocked':blocked,'photoApproved':approved,'note':note.strip()})
   record.update(status=status,segmentId=segment,blocked=blocked,photoApproved=approved,reviewNote=note.strip(),
                 reviewedAt=now(),verificationSource='local_admin_claim_not_independent_survey')
   self.write(items)
   return record


def segment_near_report(path_file,segment,record):
 try:ways=json.loads(Path(path_file).read_text('utf-8'))['elements']
 except (OSError,ValueError,KeyError):return False
 wid,index=segment.split(':');i=int(index)
 way=next((w for w in ways if str(w.get('id'))==wid and w.get('type')=='way'),None)
 if not way or i<1 or i>=len(way.get('geometry',[])):return False
 a,b=way['geometry'][i-1:i+1]
 def xy(p):return ((p['lon']-record['lng'])*111195*math.cos(math.radians(record['lat'])),(p['lat']-record['lat'])*111195)
 ax,ay=xy(a);bx,by=xy(b);d=(bx-ax)**2+(by-ay)**2
 t=max(0,min(1,-(ax*(bx-ax)+ay*(by-ay))/d)) if d else 0
 return math.hypot(ax+t*(bx-ax),ay+t*(by-ay))<=8


def authorized(headers):
 pin=os.environ.get('MUAERO_ADMIN_PIN','')
 return len(pin)>=6 and hmac.compare_digest(headers.get('X-MUAERO-Admin-Pin',''),pin)
