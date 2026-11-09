// Full control audit against invented data. Every external request is blocked or mocked.
// Run with the same NODE_PATH and PLAYWRIGHT_BROWSERS_PATH as ui-check.mjs.
import { execSync } from 'node:child_process'
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fixtures, ME } from './ui-check/fixtures.mjs'
import { createMockBackend } from './ui-check/backend.mjs'
import { interfaceRoutes } from './ui-check/routes.mjs'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const root = resolve(fileURLToPath(import.meta.url),'../..')
const out = process.env.AUDIT_OUT || join(tmpdir(),'hockey-interaction-audit')
mkdirSync(out,{recursive:true})
const dist=join(out,'dist')
execSync(`npx vite build --outDir ${dist} --emptyOutDir`,{cwd:root,stdio:'inherit',env:{...process.env,VITE_SUPABASE_URL:'http://mock.supabase.test',VITE_SUPABASE_ANON_KEY:'sample'}})
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webmanifest':'application/manifest+json'}
const server=createServer((req,res)=>{let path=join(dist,decodeURIComponent(new URL(req.url,'http://x').pathname));if(!path.startsWith(dist)||!existsSync(path)||statSync(path).isDirectory())path=join(dist,'index.html');res.writeHead(200,{'content-type':mime[extname(path)]||'application/octet-stream'});createReadStream(path).pipe(res)})
await new Promise(ok=>server.listen(0,'127.0.0.1',ok))
const origin=`http://127.0.0.1:${server.address().port}`
const backend=createMockBackend(fixtures,ME)
const original = structuredClone(fixtures)
backend.state.mutations = true
backend.state.failure = process.env.AUDIT_FAILURE || null
backend.state.imageData = readFileSync(join(root,'public/icon-192.png'))
const browser=await chromium.launch()
const previousRecords=process.env.AUDIT_RESUME && existsSync(join(out,'controls.json')) ? JSON.parse(readFileSync(join(out,'controls.json'),'utf8')) : []
const failedCases=new Set(previousRecords.filter(r=>['script-error','action-error'].includes(r.outcome)).map(r=>`${r.role}|${r.width}|${r.path}`))
const routeReports=process.env.AUDIT_RESUME && existsSync(join(out,'routes.json')) ? JSON.parse(readFileSync(join(out,'routes.json'),'utf8')).filter(r=>!r.remainingStates&&!r.errors.length&&!failedCases.has(`${r.role}|${r.width}|${r.path}`)) : []
const completed=new Set(routeReports.map(r=>`${r.role}|${r.width}|${r.path}`))
const records=previousRecords.filter(r=>!r.path || completed.has(`${r.role}|${r.width}|${r.path}`))
const blocked=[]
const persist=()=>{writeFileSync(join(out,'controls.json'),JSON.stringify(records,null,2));writeFileSync(join(out,'routes.json'),JSON.stringify(routeReports,null,2));writeFileSync(join(out,'blocked.json'),JSON.stringify(blocked,null,2))}
const roles=(process.env.AUDIT_ROLES||'board,coach,player').split(',')
const widths=(process.env.AUDIT_WIDTHS||'375,1280').split(',').map(Number)
const filter=process.env.AUDIT_FILTER||''
const exclude=process.env.AUDIT_EXCLUDE||''
const maxDepth=Number(process.env.AUDIT_DEPTH||3)
const maxStates=Number(process.env.AUDIT_STATES||100)
const allRoutes=[...new Map(interfaceRoutes(fixtures.ids).filter(([, ,kind])=>!['auth','nogames'].includes(kind)).map(([name,path])=>[path,[name,path]])).values(),['event-presence',`/events/${fixtures.ids.training}?tab=presence`],['event-discussion',`/events/${fixtures.ids.training}?tab=discussion`],['event-ratings',`/events/${fixtures.ids.game}?tab=ratings`],['event-votes',`/events/${fixtures.ids.game}?tab=votes`],['join','/join/sample-invite'],['login','/login'],['forgot-password','/forgot-password'],['reset-password','/reset-password']].filter(([name,path])=>(name.includes(filter)||path.includes(filter))&&(!exclude||!path.includes(exclude)))
// Identify controls structurally, including duplicate row buttons and buttons revealed by menus.
function controls(){
 const modal=document.querySelector('dialog[open]')
 const visible=e=>{if(modal&&!modal.contains(e))return false;const s=getComputedStyle(e),r=e.getBoundingClientRect();return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&!e.closest('[hidden]')&&(!e.checkVisibility||e.checkVisibility({visibilityProperty:true}))}
 const css=e=>{const parts=[];while(e&&e!==document.body){const tag=e.tagName.toLowerCase();const sibs=[...e.parentElement.children];parts.unshift(`${tag}:nth-child(${sibs.indexOf(e)+1})`);e=e.parentElement}return 'body > '+parts.join(' > ')}
 return [...document.querySelectorAll('button,a[href],summary,input[type=checkbox],input[type=radio],select,input[type=file]')].filter(visible).map(e=>({selector:css(e),tag:e.tagName.toLowerCase(),name:(e.getAttribute('aria-label')||e.textContent||e.getAttribute('title')||e.labels?.[0]?.textContent||'').replace(/\s+/g,' ').trim().slice(0,180),type:e.type||'',accept:e.accept||'',href:e.getAttribute('href'),disabled:Boolean(e.disabled)||e.getAttribute('aria-disabled')==='true',selected:e.getAttribute('aria-pressed')==='true'||e.getAttribute('aria-checked')==='true',shell:!e.closest('main'),expander:e.hasAttribute('aria-expanded'),options:e.tagName==='SELECT'?[...e.options].filter(o=>!o.disabled).map(o=>({value:o.value,label:o.textContent})):[],form:Boolean(e.form)}))
}
const snapshot=page=>page.evaluate(()=>({url:location.pathname+location.search,html:document.body.innerHTML,dialogs:[...document.querySelectorAll('dialog[open],[role=dialog],[role=alertdialog]')].map(e=>e.textContent),effects:window.__auditEffects||[],errors:[...document.querySelectorAll('[role=alert],.error,.field-error')].filter(e=>e.getBoundingClientRect().height>0).map(e=>e.textContent.trim())}))
function samplePdf() {
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents 4 0 R /Resources << >> >>','<< /Length 4 >>\nstream\nq Q\nendstream']
 let text='%PDF-1.4\n';const offsets=[0]
 for(const [i,body] of objects.entries()){offsets.push(Buffer.byteLength(text));text+=`${i+1} 0 obj\n${body}\nendobj\n`}
 const xref=Buffer.byteLength(text);text+='xref\n0 5\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
 return Buffer.from(text)
}
async function sampleFile(el,accept) {
 if(accept.includes('pdf')) return el.setInputFiles({name:'browser-audit.pdf',mimeType:'application/pdf',buffer:samplePdf()})
 return el.setInputFiles(join(root,'public/icon-192.png'))
}
async function fillRequired(page,selector,path){
 const fields=page.locator(selector).locator('xpath=ancestor::form[1]').locator('input,textarea,select')
 for(let i=0;i<await fields.count();i++){
  const f=fields.nth(i),meta=await f.evaluate(e=>({type:e.type,required:e.required,value:e.value,disabled:e.disabled,min:e.min,max:e.max,maxLength:e.maxLength,label:(e.labels?.[0]?.textContent||'').toLowerCase(),autocomplete:e.autocomplete,options:e.tagName==='SELECT'?[...e.options].filter(x=>x.value&&!x.disabled).map(x=>x.value):[]}))
  if(meta.disabled||!await f.isVisible())continue
  if(meta.type==='select-one'&&!meta.value&&meta.required&&meta.options.length)await f.selectOption(meta.options[0])
  else if(meta.type==='checkbox'&&meta.required)await f.check()
  else if(meta.required&&!meta.value&&!['file','checkbox','radio'].includes(meta.type)){
   let value=meta.autocomplete==='one-time-code'?'123456':meta.type==='email'?'audit@example.test':meta.type==='password'?'CampioneSicuro123!':meta.type==='date'?fixtures.tables.events.find(e=>e.id===fixtures.ids.training).starts_at.slice(0,10):meta.type==='time'?(meta.label.includes('fine')?'21:30':'20:00'):meta.type==='number'?String(Math.max(Number(meta.min)||0,1)):'Prova audit'
   if(meta.maxLength>0)value=value.slice(0,meta.maxLength)
   await f.fill(value)
  }
 }
 if(path==='/events/new'){
  const a=page.locator('form button').filter({hasText:/^A$/}).first();if(await a.count()&&await a.getAttribute('aria-pressed')!=='true')await a.click()
 }
}
for(const role of roles)for(const width of widths){
 fixtures.tables.user_roles=role==='player'?[]:[{user_id:ME,role}]
 const context=await browser.newContext({viewport:{width,height:900},locale:'it-IT',timezoneId:'Europe/Rome',serviceWorkers:'block',acceptDownloads:true})
 await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin===origin)return route.continue();if(u.origin==='http://mock.supabase.test')return backend.answer(route);blocked.push({role,width,url:u.origin+u.pathname});return route.fulfill({status:404,body:''})})
 await context.addInitScript(({me,email,role})=>{
  if(!['/login','/join/sample-invite','/forgot-password'].includes(location.pathname)){
   localStorage.setItem('sb-mock-auth-token',JSON.stringify({access_token:'sample',refresh_token:'sample',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+36000,user:{id:me,email,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}}))
  }else localStorage.removeItem('sb-mock-auth-token')
  localStorage.setItem('view-as',role);localStorage.removeItem('calendar-view');localStorage.removeItem('group-filter')
  window.__auditEffects=[]
  window.print=()=>window.__auditEffects.push({kind:'print'})
  window.open=url=>{window.__auditEffects.push({kind:'open',url});return null}
  try{Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.__auditEffects.push({kind:'copy',text})}})}catch{}
 },{me:ME,email:fixtures.me.email,role})
 const page=await context.newPage()
 page.setDefaultTimeout(2500)
 let pageErrors=[]
 page.on('pageerror',e=>pageErrors.push(e.message))
 page.on('dialog',d=>d.dismiss())
 page.on('download',d=>{records.push({role,width,page:'download',name:d.suggestedFilename(),outcome:'download'})})
 const shellDone=new Set()
 for(const [name,path] of allRoutes){
  if(completed.has(`${role}|${width}|${path}`))continue
  console.log(JSON.stringify({role,width,starting:name}))
  const seen=new Set(),queue=[[]],summary={role,width,name,path,states:0,controls:0,redirect:null,errors:[]}
  const open=async trail=>{fixtures.tables=structuredClone(original.tables);fixtures.rpc=structuredClone(original.rpc);fixtures.mockFactors=structuredClone(original.mockFactors??[]);fixtures.tables.user_roles=role==='player'?[]:[{user_id:ME,role}];pageErrors=[];await page.goto(origin+path,{waitUntil:'domcontentloaded'});await page.waitForSelector('h1,.section-shell',{state:'attached',timeout:4000}).catch(()=>{});await page.waitForTimeout(100);for(const action of trail){const el=page.locator(action.selector);if(action.file)await sampleFile(el,action.accept);else if(action.option!==undefined)await el.selectOption(action.option);else await el.click();await page.waitForTimeout(35)}}
  try{await open([])}catch(e){summary.errors.push(String(e));routeReports.push(summary);persist();continue}
  const actual=new URL(page.url()).pathname+new URL(page.url()).search
  if(actual!==path){summary.redirect=actual;routeReports.push(summary);persist();continue}
  if(process.env.AUDIT_CAPTURE_ONLY){await page.screenshot({path:join(out,`${name}-${width}.png`),fullPage:true});routeReports.push(summary);persist();continue}
  while(queue.length&&summary.states<maxStates){
   const trail=queue.shift();summary.states++
   try{await open(trail)}catch(e){summary.errors.push({trail,error:String(e)});continue}
   const buttons=await page.evaluate(controls)
   for(const control of buttons){
    const key=control.selector+'|'+control.name+'|'+control.href+'|'+control.type
    if(seen.has(key))continue
    seen.add(key)
    if(control.shell){const shellKey=control.tag+control.name+control.href;if(shellDone.has(shellKey))continue;shellDone.add(shellKey)}
    const record={role,width,page:name,path,trail:trail.map(x=>x.name),...control}
    summary.controls++
    if(control.disabled){records.push({...record,outcome:'disabled'});continue}
    if(control.tag==='a'&&control.href&&!control.href.startsWith('/')&&!control.href.startsWith('#')){records.push({...record,outcome:'external-link-inspected'});continue}
    const options=control.tag==='select'?control.options.map(o=>o.value):[undefined]
    for(const option of options){
     try{
      await open(trail)
      if(process.env.AUDIT_TRACE)console.log('click',control.name,trail.map(x=>x.name))
      const el=page.locator(control.selector)
      if(!await el.isVisible()){records.push({...record,option,outcome:'state-changed'});continue}
      if(control.type==='submit'&&control.form)await fillRequired(page,control.selector,path)
      const before=await snapshot(page),start=backend.requests.length
      if(control.type==='file'){
       await sampleFile(el,control.accept)
      }else if(option!==undefined)await el.selectOption(option)
      else if(control.href === '#main'){await el.focus();await el.press('Enter')}
      else await el.click()
      await page.waitForTimeout(/^(Stampa|Scarica|Esporta|Print|Download|Export)/.test(control.name)?240:100)
      const after=await snapshot(page)
      const requests=backend.requests.slice(start).filter(r=>r.method!=='OPTIONS')
      const changed=JSON.stringify(before)!==JSON.stringify(after)
      const errors=pageErrors.slice()
      records.push({...record,option,outcome:errors.length?'script-error':after.errors.length?'message':changed?'changed':requests.length?'request':'unchanged',messages:after.errors,requests,errors})
      if(/^(Annulla|Chiudi)$/i.test(control.name)&&requests.some(r=>['PATCH','PUT','DELETE'].includes(r.method)&&!r.path.startsWith('/auth/v1/factors/')))summary.errors.push({control:control.name,problem:'cancel submitted a mutation',requests})
      if(!control.name&&control.tag!=='select'&&control.type!=='file')summary.errors.push({control:control.selector,problem:'unlabelled control'})
      if(errors.length)summary.errors.push({control:control.name,errors})
      if(changed&&after.url===before.url&&trail.length<maxDepth&&control.tag!=='a'&&!(control.type==='submit'&&control.form)&&!['checkbox','radio'].includes(control.type)){
       const next=await page.evaluate(controls)
       if((control.expander||control.tag==='summary'||after.dialogs.length>before.dialogs.length||((next.length>buttons.length||control.type==='file')&&/^(Nuov|Aggiung|Modifica|Crea|Attiva|Seleziona|Carica|Foto)/i.test(control.name))||/^(Settimana|Mese|Elenco|Mostra password|Nascondi password)$/.test(control.name))&&next.some(c=>!seen.has(c.selector+'|'+c.name+'|'+c.href+'|'+c.type)))queue.push([...trail,{selector:control.selector,name:control.name,option,file:control.type==='file',accept:control.accept}])
      }
     }catch(e){records.push({...record,option,outcome:'action-error',error:String(e).split('\n').slice(0,6).join('\n')})}
     persist()
    }
   }
   persist()
  }
  summary.remainingStates=queue.length
  routeReports.push(summary);persist()
  console.log(JSON.stringify({role,width,page:name,controls:summary.controls,states:summary.states,remaining:queue.length,errors:summary.errors.length}))
 }
 await context.close()
}
await browser.close();server.close();persist()
console.log(JSON.stringify({routes:routeReports.length,actions:records.length,errors:records.filter(r=>['script-error','action-error'].includes(r.outcome)).length}))
