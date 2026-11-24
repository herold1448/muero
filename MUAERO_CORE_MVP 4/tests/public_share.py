"""Two independent HTTP clients against one public-mode server and persistent volume."""
import base64
import io
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
URL='http://127.0.0.1:4296'
PIN='test-public-pin-123456'

class PublicShare(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(dir=ROOT.parent)
  self.env={**os.environ,'PORT':'4296','MUAERO_PUBLIC':'1','MUAERO_HAZARD_DIR':self.temp.name,'MUAERO_ADMIN_PIN':PIN}
  self.start()
 def start(self):
  self.proc=subprocess.Popen([sys.executable,'server.py'],cwd=ROOT,env=self.env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
  for _ in range(50):
   try:self.get('/api/health');return
   except Exception:time.sleep(.1)
  raise RuntimeError('public server failed to start')
 def tearDown(self):
  self.proc.terminate();self.proc.wait(timeout=5);self.proc.stderr.close();self.temp.cleanup()
 def get(self,path,pin=''):
  with urllib.request.urlopen(urllib.request.Request(URL+path,headers={'X-MUAERO-Admin-Pin':pin}),timeout=5) as r:
   return json.load(r) if r.headers.get_content_type()=='application/json' else r.read()
 def post(self,path,item,pin=''):
  req=urllib.request.Request(URL+path,data=json.dumps(item).encode(),headers={'Content-Type':'application/json','X-MUAERO-Admin-Pin':pin},method='POST')
  with urllib.request.urlopen(req,timeout=5) as r:return json.load(r)
 def status(self,code,action):
  with self.assertRaises(urllib.error.HTTPError) as failure:action()
  self.assertEqual(failure.exception.code,code)
 def test_A_B_restart_review_resolve(self):
  for asset in ('/','/index.html','/admin.html','/mvp.css','/src/mvp.js','/src/admin.js','/vendor/three.module.js'):
   self.assertTrue(self.get(asset),asset)
  self.status(403,lambda:self.get('/legacy.html'))
  self.status(403,lambda:self.post('/api/reviews',{}))
  picture=Image.new('RGB',(50,40),'orange');buf=io.BytesIO();picture.save(buf,format='JPEG')
  way=next(w for w in json.loads((ROOT/'data/campus_paths.json').read_text())['elements'] if w.get('tags',{}).get('highway')=='footway' and len(w['geometry'])>1)
  a,b=way['geometry'][:2];lat=(a['lat']+b['lat'])/2;lng=(a['lon']+b['lon'])/2;segment=f"{way['id']}:1"
  item={'lat':lat,'lng':lng,'category':'construction','description':'A가 지도에 지정한 위치','photoBase64':'data:image/jpeg;base64,'+base64.b64encode(buf.getvalue()).decode(),'clientReportId':'client-A-map-pin-123'}
  a_response=self.post('/api/hazards',item);self.assertIsNone(a_response['photoUrl'])
  b_response=self.get('/api/hazards');self.assertEqual(len(b_response),1);self.assertEqual(b_response[0]['id'],a_response['id']);self.assertEqual((b_response[0]['lat'],b_response[0]['lng']),(lat,lng))
  private=self.get('/api/hazards/admin',PIN)[0]['photoUrl'];self.status(403,lambda:self.get(private))
  self.proc.terminate();self.proc.wait(timeout=5);self.proc.stderr.close();self.start()
  self.assertEqual(self.get('/api/hazards')[0]['id'],a_response['id'])
  url=f"/api/hazards/{a_response['id']}/review"
  self.post(url,{'status':'VERIFIED','segmentId':segment,'blocked':True,'photoApproved':True,'note':'현장 위치와 사진 확인함'},PIN)
  b_updated=self.get('/api/hazards')[0];self.assertEqual(b_updated['status'],'VERIFIED');self.assertTrue(b_updated['blocked']);self.assertEqual(b_updated['photoUrl'],private);self.assertEqual(self.get(private),buf.getvalue())
  self.post(url,{'status':'RESOLVED','segmentId':segment,'blocked':False,'photoApproved':False,'note':'현장 장애물 제거 확인함'},PIN)
  self.assertEqual(self.get('/api/hazards'),[]);self.status(403,lambda:self.get(private))
  admin=self.get('/api/hazards/admin',PIN)[0];self.assertEqual(len(admin['history']),2);self.assertEqual(admin['status'],'RESOLVED')
  self.assertTrue((Path(self.temp.name)/'hazards.json').exists());self.assertTrue((Path(self.temp.name)/'hazard_photos'/f"{admin['id']}.jpg").exists())
  print('PASS public A/B share, private photo, approval, block, resolve, restart and history')

if __name__=='__main__':unittest.main()
