const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.platform==='linux'?{executablePath:'/usr/bin/chromium',args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}:{} )});
 const results=[];
 for(const size of [{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}]){
  const page=await browser.newPage({viewport:size,deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text())});
  await page.goto('http://127.0.0.1:4173/?v=8',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#sourceTag')?.textContent==='OSM 좌표 기반',{timeout:30000});
  await page.waitForTimeout(1000);
  const before=await page.evaluate(()=>{
   const el=document.querySelector('#stage'),gl=el.getContext('webgl2')||el.getContext('webgl');
   const pixels=new Uint8Array(4);gl.readPixels(Math.floor(el.width*.7),Math.floor(el.height*.55),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   return {width:el.width,height:el.height,pixel:[...pixels],overflow:document.documentElement.scrollWidth>innerWidth,legend:document.querySelector('#geometryLegend').textContent,source:document.querySelector('#sourceTag').textContent,three:!!document.querySelector('canvas')};
  });
   if(before.width<100)throw Error(size.name+' canvas not initialized '+JSON.stringify(before));
  if(before.overflow)throw Error(size.name+' horizontal overflow');
  await page.locator('#routeBtn').click();
  await page.waitForFunction(()=>!document.querySelector('#playBtn').disabled,{timeout:20000});
  const route=await page.locator('#routeAudit').textContent();
  if(!route.includes('미확인'))throw Error('route audit missing');
  await page.locator('#playBtn').click();
  await page.waitForTimeout(1400);
  const movement=await page.evaluate(()=>({progress:document.querySelector('#progress').style.width,mode:document.querySelector('#cameraLabel').textContent}));
  if(!parseFloat(movement.progress))throw Error(size.name+' wheelchair did not advance');
  await page.screenshot({path:'tests/render-'+size.name+'.png'});
  await page.locator('#entranceToggle').click();if(!await page.locator('#entranceModal').isVisible())throw Error('entrance modal not visible');
  await page.locator('#modalClose').click();
  await page.locator('#reviewToggle').click();if(!await page.locator('#reviewModal').isVisible())throw Error('review modal not visible');
  if(errors.length)throw Error(size.name+' browser errors '+JSON.stringify(errors));
  results.push({size:size.name,framebuffer:before.pixel,legend:before.legend,route:route.slice(0,120),movement});
  await page.close();
 }
 await browser.close();
 fs.writeFileSync('tests/browser-v8-results.json',JSON.stringify(results,null,2));
 console.log('PASS Chromium desktop and mobile',JSON.stringify(results));
})().catch(e=>{console.error(e);process.exit(1)});
