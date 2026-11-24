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

ROOT=Path(__file__).resolve().parents[1];PORT='4295';BASE='http://127.0.0.1:'+PORT


class HazardAPITest(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.env={**os.environ,'GILON_PORT':PORT,'MUAERO_ADMIN_PIN':'testing-654321','MUAERO_HAZARD_DIR':self.temp.name}
  self.start()

 def start(self):
  self.process=subprocess.Popen([sys.executable,'server.py'],cwd=ROOT,env=self.env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  for _ in range(50):
   try:self.get('/api/health');return
   except Exception:time.sleep(.1)
  raise RuntimeError('server failed to start')

 def tearDown(self):self.process.terminate();self.process.wait(timeout=5);self.temp.cleanup()

 def get(self,path,pin=None):
  req=urllib.request.Request(BASE+path,headers={'X-MUAERO-Admin-Pin':pin or ''})
  with urllib.request.urlopen(req,timeout=6) as response:
   if path.startswith('/api/hazard-photo/'):return response.read()
   return json.load(response)

 def post(self,path,data,pin=None):
  req=urllib.request.Request(BASE+path,data=json.dumps(data).encode(),headers={'Content-Type':'application/json','X-MUAERO-Admin-Pin':pin or ''},method='POST')
  with urllib.request.urlopen(req,timeout=6) as response:return json.load(response)

 def assert_http(self,code,fn):
  with self.assertRaises(urllib.error.HTTPError) as err:fn()
  self.assertEqual(err.exception.code,code)

 def test_report_moderate_block_resolve_persist(self):
  from json import loads
  source=loads((ROOT/'data/campus_paths.json').read_text())['elements'];way=next(w for w in source if w.get('tags',{}).get('highway')=='footway' and len(w['geometry'])>1)
  a,b=way['geometry'][:2];lat=(a['lat']+b['lat'])/2;lng=(a['lon']+b['lon'])/2;segment=f"{way['id']}:1"
  pic=Image.new('RGB',(60,40),'orange');out=io.BytesIO();pic.save(out,format='JPEG');raw=out.getvalue()
  report={'lat':lat,'lng':lng,'category':'construction','description':'현장 확인 필요','photoBase64':'data:image/jpeg;base64,'+base64.b64encode(raw).decode(),'clientReportId':'test-report-unique-01'}
  self.assert_http(403,lambda:self.get('/api/hazards/admin'))
  first=self.post('/api/hazards',report);self.assertEqual(first['status'],'REPORTED');self.assertFalse(first['blocked']);self.assertIsNone(first['photoUrl'])
  self.assertEqual(len(self.get('/api/hazards')),1)
  admin=self.get('/api/hazards/admin','testing-654321')[0];self.assert_http(403,lambda:self.get(admin['photoUrl']));self.assertEqual(self.get(admin['photoUrl'],'testing-654321'),raw)
  self.assertEqual(first['id'],self.post('/api/hazards',report)['id']);self.assertEqual(len(self.get('/api/hazards')),1)
  url='/api/hazards/'+first['id']+'/review';payload={'status':'VERIFIED','segmentId':segment,'blocked':True,'photoApproved':True,'note':'현장 점검으로 막힌 선분 확인'}
  self.assert_http(403,lambda:self.post(url,payload))
  self.assert_http(400,lambda:self.post(url,{**payload,'segmentId':'999999999:1'},'testing-654321'))
  result=self.post(url,payload,'testing-654321');self.assertTrue(result['blocked']);self.assertEqual(result['segmentId'],segment)
  self.assertEqual(self.get('/api/hazards')[0]['photoUrl'],admin['photoUrl']);self.assertEqual(self.get(admin['photoUrl']),raw)
  self.process.terminate();self.process.wait(timeout=5);self.start()
  self.assertTrue(self.get('/api/hazards')[0]['blocked'])
  resolved=self.post(url,{'status':'RESOLVED','segmentId':segment,'blocked':False,'note':'현장 장애물 제거 확인'},'testing-654321')
  self.assertFalse(resolved['blocked']);self.assertEqual(resolved['status'],'RESOLVED')
  self.assertEqual(self.get('/api/hazards'),[]);self.assertEqual(len(self.get('/api/hazards/admin','testing-654321')[0]['history']),2)
  self.assert_http(403,lambda:self.get('/data/hazards.json'))
  self.assert_http(400,lambda:self.post('/api/hazards',{**report,'clientReportId':'different-id','photoBase64':report['photoBase64']+'garbage'}))
  print('PASS photo report, duplicate, authorization, linked segment, block, resolve, persistence')


if __name__=='__main__':unittest.main()
