"""Local Chrome smoke test, does not establish physical accessibility."""
import os,subprocess,time,urllib.request,json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
port='4293'
proc=subprocess.Popen(['python3','server.py'],cwd=ROOT,env={**os.environ,'GILON_PORT':port},stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
try:
 for i in range(30):
  try:
   with urllib.request.urlopen('http://127.0.0.1:'+port+'/api/health',timeout=2) as f:
    assert json.load(f)['ok'];break
  except Exception:time.sleep(.3)
 else:raise RuntimeError('Server not responding')
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium',args=['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage'])
  desktop=browser.new_context(viewport={'width':1420,'height':880},device_scale_factor=1)
  page=desktop.new_page();errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:'+port+'/?v=70',wait_until='domcontentloaded',timeout=25000)
  page.wait_for_function("document.querySelector('#countPaths')?.textContent==='928개'",timeout=25000)
  assert '1422' in page.locator('#countBuildings').inner_text()
  page.locator('#routeBtn').click()
  page.wait_for_timeout(1000)
  print('DESKTOP route:',page.locator('#distanceText').inner_text(),'risk:',page.locator('#navRisk').inner_text())
  assert 'm' in page.locator('#distanceText').inner_text(), 'route computed'
  assert '미확인' in page.locator('#navRisk').inner_text()
  page.locator('#playBtn').click()
  page.wait_for_timeout(500)
  assert '일시정지' in page.locator('#playBtn').inner_text()
  page.screenshot(path=str(ROOT/'tests/desktop_v7.png'))
  page.locator('#entranceToggle').click()
  assert page.locator('#entranceModal').is_visible()
  page.locator('#entranceBuilding').fill('중앙도서관')
  page.locator('#entranceLat').fill('35.17705')
  page.locator('#entranceLng').fill('126.90565')
  page.locator('#saveEntrance').click()
  page.wait_for_timeout(700)
  assert '중앙도서관' in page.locator('#entranceList').inner_text()
  with urllib.request.urlopen('http://127.0.0.1:'+port+'/api/history') as f:
   hist=json.load(f)
  assert any(t['kind']=='entrance' for t in hist)
  # Delete test data through UI so ZIP defaults contain no fabricated field records.
  page.locator('#entranceList button').first.click()
  page.wait_for_timeout(400)
  page.locator('#modalClose').click()
  page.locator('#reviewToggle').click()
  assert page.locator('#reviewModal').is_visible()
  assert len(errors)==0,errors
  print('DESKTOP: PASS canvas, controls, route, history, entrance editing, page errors=0')
  mob=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
  m=mob.new_page();merrors=[];m.on('pageerror',lambda e:merrors.append(str(e)))
  m.goto('http://127.0.0.1:'+port+'/?v=70',wait_until='domcontentloaded',timeout=25000)
  m.wait_for_function("document.querySelector('#countPaths')?.textContent==='928개'",timeout=25000)
  m.locator('#routeBtn').click()
  m.wait_for_timeout(500)
  assert not m.locator('#playBtn').is_disabled()
  m.screenshot(path=str(ROOT/'tests/mobile_v7.png'))
  assert not merrors,merrors
  print('MOBILE: PASS 390x844 route, button enabled, no js error; screenshot saved')
  browser.close()
finally:
 proc.terminate()
 try:proc.wait(timeout=5)
 except subprocess.TimeoutExpired:proc.kill()
 # Test writes must not be shipped in the source ZIP.
 for name in ('entrances.json','history.json'):
  try:(ROOT/'data'/name).unlink()
  except FileNotFoundError:pass
