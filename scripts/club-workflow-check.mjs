// Focused regression checks against invented data. Never uses a hosted account.
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fixtures as template, ME } from './ui-check/fixtures.mjs'
import { createMockBackend } from './ui-check/backend.mjs'
const require=createRequire(import.meta.url)
const {chromium,webkit}=require('playwright')
const root=resolve(fileURLToPath(import.meta.url),'../..')
const out=process.env.CLUB_CHECK_OUT||'/private/tmp/club-workflow-check'
mkdirSync(out,{recursive:true})
const dist=join(out,'dist')
execSync(`npx vite build --outDir ${dist} --emptyOutDir`,{cwd:root,stdio:'pipe',env:{...process.env,VITE_SUPABASE_URL:'http://mock.supabase.test',VITE_SUPABASE_ANON_KEY:'sample'}})
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png'}
const server=createServer((req,res)=>{let path=join(dist,decodeURIComponent(new URL(req.url,'http://x').pathname));if(!path.startsWith(dist)||!existsSync(path)||statSync(path).isDirectory())path=join(dist,'index.html');res.writeHead(200,{'content-type':mime[extname(path)]||'application/octet-stream'});createReadStream(path).pipe(res)})
await new Promise(ok=>server.listen(0,'127.0.0.1',ok))
const origin=`http://127.0.0.1:${server.address().port}`
const browser=await (process.env.CLUB_CHECK_WEBKIT?webkit:chromium).launch()
const report=process.env.CLUB_CHECK_RESUME&&existsSync(join(out,'report.json'))?JSON.parse(readFileSync(join(out,'report.json'),'utf8')):[]
const done=(name,role,width)=>report.some(r=>r.name===name&&r.role===role&&r.width===width)
async function session(role,width=1280){
 const fixtures=structuredClone(template)
 const backend=createMockBackend(fixtures,ME);backend.state.mutations=true
 const calls=[]
 const context=await browser.newContext({viewport:{width,height:850},locale:'it-IT',timezoneId:'Europe/Rome',serviceWorkers:'block',colorScheme:process.env.CLUB_CHECK_DARK?'dark':'light'})
 await context.addInitScript(({role,me,email,large})=>{
  localStorage.setItem('view-as',role)
  localStorage.setItem('sb-mock-auth-token',JSON.stringify({access_token:'sample',refresh_token:'sample',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+36000,user:{id:me,email,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}}))
  if(large)document.addEventListener('DOMContentLoaded',()=>{document.documentElement.style.fontSize='133%'})
 },{role,me:ME,email:fixtures.me.email,large:Boolean(process.env.CLUB_CHECK_LARGE)})
 await context.route('http://mock.supabase.test/**',async route=>{
  const request=route.request(),url=new URL(request.url())
  if(request.method()==='POST'&&url.pathname.startsWith('/rest/v1/rpc/')){
   const name=url.pathname.split('/').pop(),body=request.postDataJSON();calls.push({name,body})
   if(name==='submit_club_request'){
    const r=fixtures.tables.club_requests.find(r=>r.id===body.p_id)
    const response={request_id:r.id,user_id:ME,file_path:body.p_file,submitted_at:new Date().toISOString(),status:r.review?'pending':'complete',review_note:''}
    fixtures.tables.club_request_responses=fixtures.tables.club_request_responses.filter(s=>!(s.request_id===r.id&&s.user_id===ME));fixtures.tables.club_request_responses.push(response)
    return route.fulfill({json:null,headers:{'access-control-allow-origin':'*'}})
   }
   if(name==='review_club_request'){
    const r=fixtures.tables.club_request_responses.find(r=>r.request_id===body.p_id&&r.user_id===body.p_user)
    Object.assign(r,{status:body.p_approve?'approved':'rejected',review_note:body.p_note})
    return route.fulfill({json:null,headers:{'access-control-allow-origin':'*'}})
   }
  }
  if(request.method()==='POST'&&url.pathname==='/rest/v1/club_requests')calls.push({name:'publish',body:request.postDataJSON()})
  return backend.answer(route)
 })
 const page=await context.newPage();page.setDefaultTimeout(8000)
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 async function go(path){await page.goto(origin+path);await page.waitForLoadState('networkidle');await page.waitForTimeout(150)}
 async function shot(name){const old=page.viewportSize();await page.evaluate(()=>window.scrollTo(0,0));const height=await page.evaluate(()=>document.documentElement.scrollHeight);await page.setViewportSize({width,height:Math.min(6000,Math.max(850,height))});await page.screenshot({path:join(out,`${width}-${role}-${name}.png`)});await page.setViewportSize(old)}
 async function finish(name){assert.deepEqual(errors,[]);report.push({name,role,width,passed:true});writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2));await context.close()}
 return {page,go,shot,finish,fixtures,calls,backend}
}
try {
 for(const width of [375,1280]){
  if(!done('publish targeted request and review upload','board',width)){
   const s=await session('board',width),{page,go,shot,finish,calls}=s
   await go('/settings/documents')
   await page.getByRole('button',{name:'Aggiungi richiesta',exact:true}).click()
   await page.getByLabel('Titolo della richiesta',{exact:true}).fill('Modulo stagione')
   await page.getByLabel('Cosa deve fare il membro',{exact:true}).selectOption('upload')
   await page.getByRole('button',{name:'A',exact:true}).click()
   await shot('request-create')
   await page.getByRole('button',{name:'Pubblica richiesta',exact:true}).click()
   await page.getByText('Richiesta pubblicata.',{exact:true}).waitFor()
   assert.equal(calls.find(c=>c.name==='publish').body.review,true)
   assert.deepEqual(calls.find(c=>c.name==='publish').body.group_ids,[1])
   const pending=page.locator('.request-card').filter({has:page.getByRole('heading',{name:'Modulo firmato da verificare',exact:true})})
   await pending.getByLabel('Nota per il membro (facoltativa)',{exact:true}).fill('Manca una pagina')
   await pending.getByRole('button',{name:'Richiedi correzione',exact:true}).click()
   await page.getByText('Verifica registrata.',{exact:true}).waitFor()
   assert.equal(calls.find(c=>c.name==='review_club_request').body.p_approve,false)
   await shot('requests-staff')
   await finish('publish targeted request and review upload')
  }
  if(!done('player confirmation and signed-file submission','player',width)){
   const {page,go,shot,finish,calls}=await session('player',width)
   await go('/profile/documents')
   assert.equal(await page.getByRole('button',{name:'Aggiungi richiesta',exact:true}).count(),0)
   const read=page.locator('.request-card').filter({has:page.getByRole('heading',{name:'Regolamento: conferma di lettura',exact:true})})
   assert.equal(await read.getByRole('button',{name:'Conferma',exact:true}).isDisabled(),true)
   await read.getByLabel('Confermo di aver letto il documento',{exact:true}).check()
   await read.getByRole('button',{name:'Conferma',exact:true}).click()
   await read.getByText('Completato',{exact:true}).waitFor()
   await read.getByText(/Risposta registrata il/).waitFor()
   const upload=page.locator('.request-card').filter({has:page.getByRole('heading',{name:'Modulo firmato da verificare',exact:true})})
   await upload.locator('input[type=file]').setInputFiles({name:'modulo.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n%%EOF')})
   await upload.getByRole('button',{name:'Invia documento',exact:true}).click()
   await upload.getByText('In attesa di verifica dello staff',{exact:true}).waitFor()
   assert.equal(await upload.getByRole('button',{name:'Invia documento',exact:true}).count(),0)
   assert.equal(calls.filter(c=>c.name==='submit_club_request').length,2)
   await shot('requests-player');await finish('player confirmation and signed-file submission')
  }
  if(!done('create a linked event with inherited teams and separate attendance','board',width)){
   const {page,go,shot,finish,calls,fixtures}=await session('board',width)
   await go(`/events/new?parent=${fixtures.ids.training}&position=before`)
   assert.equal(await page.getByLabel('Tipo',{exact:true}).inputValue(),'theory')
   assert.equal(await page.getByRole('button',{name:'Nessuna',exact:true}).getAttribute('aria-pressed'),'true')
   await shot('related-new')
   await page.locator('main form button[type=submit]').click()
   await page.waitForURL(`**/events/${fixtures.ids.training}`)
   const save=calls.find(c=>c.name==='save_event').body
   assert.equal(save.p_changes.parent_event_id,fixtures.ids.training)
   assert.equal(save.p_changes.type,'theory');assert.equal(save.p_changes.rink_id,null)
   await finish('create a linked event with inherited teams and separate attendance')
  }
 }
 if(!done('home rink and full reservation distinct from match duration','board',1280)){
  const {page,go,shot,finish,calls}=await session('board')
  await go('/events/new')
  await page.getByLabel('Tipo',{exact:true}).selectOption('game')
  await page.getByLabel('Avversario',{exact:true}).fill('HC Esempio')
  await page.getByLabel('Data',{exact:true}).fill('2030-11-12')
  await page.getByLabel('Inizio',{exact:true}).fill('22:30')
  await page.getByLabel('Fine',{exact:true}).fill('23:55')
  assert.equal(await page.getByRole('button',{name:'Grande',exact:true}).getAttribute('aria-pressed'),'true')
  await page.getByRole('button',{name:'A',exact:true}).click()
  await page.getByLabel('Ghiaccio dalle',{exact:true}).fill('21:00')
  await page.getByLabel('Data fine prenotazione',{exact:true}).fill('2030-11-13')
  await page.getByLabel('Ghiaccio alle',{exact:true}).fill('00:30')
  await shot('home-booking')
  await page.locator('main form button[type=submit]').click()
  await page.waitForURL('**/events/'+template.ids.training)
  const save=calls.find(c=>c.name==='save_event').body.p_changes
  assert.equal((Date.parse(save.booking_ends_at)-Date.parse(save.booking_starts_at))/3600000,3.5)
  assert.equal(save.rink_id,1)
  await finish('home rink and full reservation distinct from match duration')
 }
 if(!done('calendar context survives saving and refresh','board',1280)){
  const {page,go,shot,finish,fixtures}=await session('board')
  await go('/events')
  await page.getByRole('button',{name:'Elenco',exact:true}).click()
  await page.getByLabel('Cerca un evento',{exact:true}).fill('Allenamento')
  await page.getByRole('button',{name:'Tutta la stagione',exact:true}).click()
  const query=await page.locator('.cal-filters input[type=search]').inputValue()
  const target=page.locator(`.cal-main a[href="/events/${fixtures.ids.training}"]`).filter({hasText:'Allenamento'}).first()
  await target.click()
  await page.locator('.ev-band .event-actions summary').click()
  await page.getByRole('menuitem',{name:'Modifica',exact:true}).click()
  await page.locator('main form button[type=submit]').click()
  await page.locator('.side a[href="/events"]').click()
  await page.locator('.cal-filters input[type=search]').waitFor()
  assert.equal(await page.locator('.cal-filters input[type=search]').inputValue(),query)
  assert.equal(await page.getByRole('button',{name:'Elenco',exact:true}).getAttribute('aria-pressed'),'true')
  assert.equal(await page.getByRole('button',{name:'Tutta la stagione',exact:true}).getAttribute('aria-pressed'),'true')
  await page.reload();await page.waitForLoadState('networkidle')
  assert.equal(await page.locator('.cal-filters input[type=search]').inputValue(),query)
  await shot('calendar-restored');await finish('calendar context survives saving and refresh')
 }
 if(!done('coach review and club library access','coach',375)){
  const {page,go,shot,finish}=await session('coach',375)
  await go('/settings/documents')
  assert.equal(await page.getByRole('button',{name:'Aggiungi richiesta',exact:true}).count(),0)
  await page.getByRole('button',{name:'Approva',exact:true}).waitFor()
  await page.locator('[data-fold=library] .fold-head').click()
  assert.equal(await page.locator('[data-fold=library] button').filter({hasText:'Aggiungi documento'}).count(),0)
  await shot('documents-coach');await finish('coach review and club library access')
 }
 if(!done('request load failure and retry','board',1280)){
  const {page,go,shot,finish,backend}=await session('board')
  backend.state.failure='/rest/v1/club_requests'
  await go('/settings/documents')
  await page.getByRole('button',{name:'Riprova',exact:true}).waitFor()
  assert.equal(await page.getByRole('button',{name:'Aggiungi richiesta',exact:true}).count(),0)
  backend.state.failure=null
  await page.getByRole('button',{name:'Riprova',exact:true}).click()
  await page.getByRole('button',{name:'Aggiungi richiesta',exact:true}).waitFor()
  await shot('requests-recovered');await finish('request load failure and retry')
 }
 if(!done('display aliases preserve league source','board',1280)){
  const {page,go,shot,finish,fixtures}=await session('board')
  const original=fixtures.tables.groups[0].league_team
  fixtures.tables.groups[0].league_alias='C Black'
  await go('/campionato')
  await page.locator('table.standings').getByText('C Black',{exact:true}).waitFor()
  assert.equal(fixtures.tables.groups[0].league_team,original)
  await shot('league-alias');await finish('display aliases preserve league source')
 }
} finally {
 await browser.close();server.close();writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2))
}
console.log(`${report.length} focused club workflow cases passed`)
