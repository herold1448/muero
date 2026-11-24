import unittest,tempfile,sys,threading,json,urllib.request,os,subprocess,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class APITest(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory()
  self.proc=subprocess.Popen([sys.executable,'server.py'],cwd=ROOT,env={**os.environ,'GILON_PORT':'4294','MUAERO_STATE_DIR':self.temp.name,'MUAERO_HAZARD_DIR':self.temp.name},stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  for _ in range(25):
   try:self.get('/api/health');break
   except Exception:time.sleep(.1)
 def tearDown(self):
  self.proc.terminate();self.proc.wait(timeout=5)
  self.temp.cleanup()
 def get(self,path):
  with urllib.request.urlopen('http://127.0.0.1:4294'+path,timeout=8) as r:return json.load(r)
 def post(self,path,data):
  req=urllib.request.Request('http://127.0.0.1:4294'+path,data=json.dumps(data,ensure_ascii=False).encode(),headers={'Content-Type':'application/json'},method='POST')
  with urllib.request.urlopen(req,timeout=8) as r:return json.load(r)
 def test_api(self):
  self.assertEqual(len(self.get('/api/paths')['elements']),928)
  self.assertEqual(len(self.get('/api/buildings')['elements']),1422)
  self.assertEqual(self.get('/api/entrances'),[])
  record={'id':'local-test','buildingId':'270549104','buildingName':'중앙도서관','lat':35.177,'lng':126.906,'accessible':'unknown','status':'unreviewed','note':'테스트','source':'local'}
  self.assertTrue(self.post('/api/entrances',[record])['saved'])
  self.assertEqual(len(self.get('/api/entrances')),1)
  self.assertEqual(self.get('/api/history')[-1]['kind'],'entrance')
  self.post('/api/entrances',[])
  self.assertEqual(self.get('/api/entrances'),[])
  self.assertIsNone(self.get('/api/history')[-1]['after'])
  self.post('/api/reviews',{'290374301:1':{'status':'blocked','note':'테스트 차단'}})
  self.assertEqual(self.get('/api/reviews')['290374301:1']['status'],'blocked')
  self.assertTrue(any(x['kind']=='review' for x in self.get('/api/history')))
  print('PASS API health, path/building, entrance save/delete/history, segment review')
if __name__=='__main__':unittest.main()
