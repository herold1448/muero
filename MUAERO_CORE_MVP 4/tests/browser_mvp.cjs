// Run against a separately started local server; requires npm playwright/Chromium.
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
(async()=>{const browser=await chromium.launch({headless:true,...(process.platform==='linux'?{executablePath:'/usr/bin/chromium',args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}: {})});
 for(const size of [{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844},{name:'small-mobile',width:375,height:667}]){
  const context=await browser.newContext({viewport:size,permissions:['geolocation'],geolocation:{latitude:35.1723634,longitude:126.9046448,accuracy:10}});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelectorAll('#buildings option').length>100,{timeout:30000});
  if(await page.locator('#error').isVisible())throw Error(await page.locator('#error').textContent());
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error(size.name+' horizontal overflow');
  await page.locator('#gpsBtn').click();await page.waitForFunction(()=>document.querySelector('#startLabel').textContent.includes('GPS 위치'));
  await page.locator('#destination').fill('중앙도서관');await page.locator('#searchBtn').click();
  await page.locator('#routeBtn').click();await page.locator('#routeResult').waitFor({state:'visible'});
  if(!await page.locator('#routeRisk').textContent().then(t=>t.includes('미확인')))throw Error('route lacks uncertainty label');
  await page.locator('#play').click();await page.locator('#sheetToggle').waitFor({state:'visible'});
  if(!await page.locator('#bottomSheet').evaluate(el=>el.classList.contains('is-collapsed')))throw Error('panel not collapsed');
  if(!await page.locator('#cameraReset').isVisible())throw Error('camera reset hidden');
  const before=await page.locator('#compactDistance').textContent();
  await page.screenshot({path:`tests/core-mvp-follow-${size.name}.png`});
  await page.locator('#sheetToggle').click();await page.locator('#pause').waitFor({state:'visible'});
  await page.locator('#sheetCollapse').click();await page.locator('#compactRoute').waitFor({state:'visible'});
  if(!await page.locator('#compactDistance').textContent())throw Error('route state lost');
  await page.locator('#cameraReset').click();
  if(before===null)throw Error('remaining distance missing');
  await page.locator('#stop').click();await page.locator('#reportBtn').click();await page.locator('#reportDialog').waitFor({state:'visible'});
  if(errors.length)throw Error(size.name+' console errors '+JSON.stringify(errors));
  console.log('PASS',size.name,'GPS → building → route → follow camera → sheet toggle → report form');await context.close();
 }
 await browser.close();})().catch(e=>{console.error(e);process.exit(1)});
