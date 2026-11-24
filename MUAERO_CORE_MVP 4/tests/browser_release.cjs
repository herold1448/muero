// Optional Mac/CI browser test. Runs an isolated local server and never touches user reports.
const fs=require('fs'),os=require('os'),path=require('path'),{spawn}=require('child_process');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
const root=path.resolve(__dirname,'..'),state=fs.mkdtempSync(path.join(os.tmpdir(),'muaero-browser-'));
const base='http://127.0.0.1:4297',pin='browser-test-pin-123456';let server,browser;
async function start(){server=spawn('python3',['server.py'],{cwd:root,env:{...process.env,GILON_PORT:'4297',MUAERO_STATE_DIR:state,MUAERO_HAZARD_DIR:state,MUAERO_ADMIN_PIN:pin},stdio:'ignore'});
 for(let i=0;i<60;i++){try{const r=await fetch(base+'/api/health');if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('isolated test server failed');}
async function stop(){if(!server)return;const child=server;server=null;child.kill();await new Promise(resolve=>child.once('exit',resolve));}
async function main(){await start();browser=await chromium.launch({headless:true,...(process.platform==='linux'?{executablePath:'/usr/bin/chromium',args:['--no-sandbox','--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']}: {})});
 const ctxA=await browser.newContext({viewport:{width:1440,height:900}}),ctxB=await browser.newContext({viewport:{width:390,height:844}});
 const a=await ctxA.newPage(),b=await ctxB.newPage();const errors=[];for(const page of [a,b])page.on('pageerror',e=>errors.push(e.message));
 await a.goto(base);await a.waitForFunction(()=>document.querySelectorAll('#buildings option').length>100);
 await a.locator('#reportBtn').click();await a.locator('#reportMap').click();await a.locator('#stage').click({position:{x:720,y:360},force:true});
 await a.locator('#locationConfirm').waitFor({state:'visible'});
 await a.locator('#reselectLocation').click();await a.locator('#stage').click({position:{x:740,y:360},force:true});
 await a.locator('#confirmLocation').click();await a.locator('#reportDialog').waitFor({state:'visible'});
 if(!await a.locator('#reportLocation').textContent().then(s=>s.includes('지도 선택')))throw Error('manual map location missing');
 await a.locator('#photo').setInputFiles(path.join(__dirname,'fixture-hazard.jpg'));await a.locator('#category').selectOption('construction');
 await a.locator('#submitReport').click();await a.waitForFunction(()=>document.querySelector('#hazardCount').textContent==='1');
 const reports=await a.request.get(base+'/api/hazards').then(r=>r.json());if(reports.length!==1||reports[0].photoUrl!==null)throw Error('unreviewed photo leaked');
 await a.screenshot({path:path.join(__dirname,'release-A-pin.png')});
 await b.goto(base);await b.waitForFunction(()=>document.querySelector('#hazardCount').textContent==='1');await b.reload();await b.waitForFunction(()=>document.querySelector('#hazardCount').textContent==='1');
 await b.screenshot({path:path.join(__dirname,'release-B-pin-mobile.png')});
 const id=reports[0].id,review=base+'/api/hazards/'+id+'/review',headers={'X-MUAERO-Admin-Pin':pin};
 let r=await a.request.post(review,{headers,data:{status:'VERIFIED',segmentId:null,blocked:false,photoApproved:true,note:'관리자 현장 사진 확인 기록'}});if(!r.ok())throw Error('admin review failed '+await r.text());
 await b.reload();await b.waitForFunction(()=>document.querySelector('#hazardCount').textContent==='1');
 r=await a.request.post(review,{headers,data:{status:'RESOLVED',segmentId:null,blocked:false,photoApproved:false,note:'현장 장애물 해결 확인'}});if(!r.ok())throw Error('resolve failed '+await r.text());
 await b.reload();await b.waitForFunction(()=>document.querySelector('#hazardCount').textContent==='0');
 await stop();await start();const persisted=await a.request.get(base+'/api/hazards/admin',{headers}).then(r=>r.json());if(persisted[0]?.history?.length!==2)throw Error('history lost after restart');
 if(errors.length)throw Error('page errors '+errors.join('; '));console.log('PASS A/B browser map pick, upload, shared pin, refresh, admin status, restart persistence');
 await ctxA.close();await ctxB.close();
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();await stop();fs.rmSync(state,{recursive:true,force:true});});
