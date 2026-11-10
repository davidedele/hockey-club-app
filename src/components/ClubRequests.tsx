import { PageSkeleton } from './Skeleton'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { t, errorText } from '../i18n'
import { supabase } from '../lib/supabase'
import { useSession } from '../lib/session'
import { checked } from '../lib/formcheck'
import { personName } from '../lib/names'
import { formatDateYear, dayKey } from '../lib/time'
import ConfirmAction from './ConfirmAction'
import LoadError from './LoadError'
import type { Group } from '../lib/types'

type Request = { id: string; title: string; instructions: string; action: 'read' | 'accept' | 'upload'; document_id: string | null; group_ids: number[]; deadline: string | null; review: boolean; active: boolean }
type Response = { request_id: string; user_id: string; file_path: string | null; submitted_at: string; status: 'complete'|'pending'|'approved'|'rejected'; review_note: string }
type Paper = { id: string; title: string; file_path: string }

export default function ClubRequests({ manage = false, userId }: { manage?: boolean; userId?: string }) {
  const { profile, isBoard, isStaff } = useSession()
  const target = userId ?? profile?.id
  const contextKey=`${manage}:${target}`
  const loadSequence=useRef(0)
  const [loadedFor,setLoadedFor]=useState('')
  const [requests, setRequests] = useState<Request[]>([])
  const [responses, setResponses] = useState<Response[]>([])
  const [papers, setPapers] = useState<Paper[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [memberships, setMemberships] = useState<{group_id:number;user_id:string}[]>([])
  const [people, setPeople] = useState<{id:string;first_name:string;last_name:string}[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [instructions, setInstructions] = useState('')
  const [action, setAction] = useState<Request['action']>('read')
  const [paper, setPaper] = useState('')
  const [pdf, setPdf] = useState<File | null>(null)
  const [chosenGroups, setChosenGroups] = useState<number[]>([])
  const [deadline, setDeadline] = useState('')
  const [review, setReview] = useState(true)
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const [files, setFiles] = useState<Record<string, File | undefined>>({})
  const [notes, setNotes] = useState<Record<string,string>>({})
  const [message, setMessage] = useState('')
  const load = useCallback(async () => {
    const attempt=++loadSequence.current
    const [r,s,p,g,n,m] = await Promise.all([
      supabase.from('club_requests').select('*').order('created_at', {ascending:false}),
      manage ? supabase.from('club_request_responses').select('*') : supabase.from('club_request_responses').select('*').eq('user_id',target ?? ''),
      supabase.from('club_documents').select('id,title,file_path'),
      supabase.from('groups').select('*').order('id'),
      manage ? supabase.from('profiles').select('id,first_name,last_name').is('deleted_at',null) : Promise.resolve({data:[],error:null}),
      manage ? supabase.from('group_members').select('group_id,user_id') : supabase.from('group_members').select('group_id,user_id').eq('user_id',target??''),
    ])
    if(attempt!==loadSequence.current)return
    setLoadedFor(contextKey)
    const failure=[r,s,p,g,n,m].find(x=>x.error)?.error
    if(failure){setError(errorText(failure));setReady(false);return}
    setRequests(((r.data??[]) as Request[]).filter(r=>manage||!r.group_ids.length||(m.data??[]).some(g=>r.group_ids.includes(g.group_id))));setMemberships(m.data??[]);setResponses((s.data??[]) as Response[]);setPapers((p.data??[]) as Paper[]);setGroups((g.data??[]) as Group[]);setPeople(n.data??[]);setReady(true)
  },[manage,target,contextKey])
  useEffect(()=>{setError('');void load();return()=>{++loadSequence.current}},[load])
  async function run(work:()=>Promise<void>){setBusy(true);setError('');setMessage('');try{await work()}catch(e){setError(errorText(e as {message:string}))}finally{setBusy(false)}}
  async function open(path:string){const preview=window.open('about:blank','_blank');if(preview)preview.opener=null;await run(async()=>{try{const r=await supabase.storage.from('documents').createSignedUrl(path,600);if(r.error)throw r.error;if(!r.data?.signedUrl)throw new Error('forbidden');if(preview)preview.location.replace(r.data.signedUrl);else window.location.assign(r.data.signedUrl)}catch(error){preview?.close();throw error}})}
  async function create(e:FormEvent){e.preventDefault();await run(async()=>{
    let documentId=paper||null
    let uploaded:string|null=null
    if(pdf){
      if(pdf.type!=='application/pdf'||pdf.size>5*1024*1024)throw new Error('request_pdf_invalid')
      uploaded=`club/doc-${Date.now()}.pdf`
      const up=await supabase.storage.from('documents').upload(uploaded,pdf,{contentType:'application/pdf'});if(up.error)throw up.error
      const row=await supabase.from('club_documents').insert({title:title.trim(),file_path:uploaded,created_by:profile?.id}).select('id').single()
      if(row.error){await supabase.storage.from('documents').remove([uploaded]);throw row.error}documentId=row.data.id;setPapers(p=>[...p,{id:row.data.id,title:title.trim(),file_path:uploaded!}]);setPaper(row.data.id);setPdf(null)
    }
    const r=await supabase.from('club_requests').insert({title:title.trim(),instructions:instructions.trim(),action,document_id:documentId,group_ids:chosenGroups,deadline:deadline||null,review:action==='upload'&&review}).select('id').single()
    if(r.error)throw r.error
    setAdding(false);setTitle('');setInstructions('');setPaper('');setPdf(null);setDeadline('');setChosenGroups([]);setMessage(t('requests.created'));await load()
  })}
  async function submit(r:Request){await run(async()=>{
    let path:string|null=null
    const file=files[r.id]
    if(r.action==='upload'){
      if(!file)throw new Error('request_file_required')
      const ext=({'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png'} as Record<string,string>)[file.type]
      if(!ext||file.size>5*1024*1024)throw new Error('request_upload_invalid')
      path=`${profile?.id}/request-${r.id}-${crypto.randomUUID()}.${ext}`
      const up=await supabase.storage.from('documents').upload(path,file,{contentType:file.type});if(up.error)throw up.error
    }
    const result=await supabase.rpc('submit_club_request',{p_id:r.id,p_file:path})
    if(result.error){if(path)await supabase.storage.from('documents').remove([path]);throw result.error}
    setChecks(c=>({...c,[r.id]:false}));setFiles(f=>({...f,[r.id]:undefined}));setMessage(t('requests.sent'));await load();window.dispatchEvent(new Event('documents-changed'))
  })}
  async function decide(r:Response,approve:boolean){await run(async()=>{const result=await supabase.rpc('review_club_request',{p_id:r.request_id,p_user:r.user_id,p_approve:approve,p_note:notes[`${r.request_id}/${r.user_id}`]??''});if(result.error)throw result.error;await load();window.dispatchEvent(new Event('documents-changed'));setMessage(t('requests.reviewed'))})}
  if(loadedFor!==contextKey)return <PageSkeleton />
  if(!ready&&error)return <LoadError title={t('requests.title')} message={error} onRetry={()=>{setError('');void load()}} />
  if(!ready)return <PageSkeleton />
  const visible=requests.filter(r=>manage||r.active||responses.some(s=>s.request_id===r.id))
  return <section className="section club-requests" aria-label={t('requests.title')}>
    <div className="page-head"><h2>{t('requests.title')}</h2>{manage&&isBoard&&<button type="button" onClick={()=>setAdding(v=>!v)}>{t('requests.add')}</button>}</div>
    <p className="hint">{t(manage?'requests.staffIntro':'requests.playerIntro')}</p>
    {error&&<p className="error" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    {adding&&<form className="form-col request-card" {...checked(create)}><fieldset disabled={busy}>
      <label>{t('requests.name')}<input required maxLength={80} value={title} onChange={e=>setTitle(e.target.value)} /></label>
      <label>{t('requests.action')}<select aria-label={t('requests.action')} value={action} onChange={e=>setAction(e.target.value as Request['action'])}>{(['read','accept','upload'] as const).map(a=><option key={a} value={a}>{t(`requests.action.${a}`)}</option>)}</select></label>
      <label>{t('requests.instructions')}<textarea maxLength={2000} value={instructions} onChange={e=>setInstructions(e.target.value)} /></label>
      <label>{t('requests.paper')}<select aria-label={t('requests.paper')} value={paper} onChange={e=>{setPaper(e.target.value);setPdf(null)}} required={action!=='upload'&&!pdf}><option value="">{t('requests.noPaper')}</option>{papers.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
      <label className="button file secondary">{t('requests.newPdf')}<input type="file" accept="application/pdf" onChange={e=>{setPdf(e.target.files?.[0]??null);setPaper('')}} /></label>{pdf&&<p className="hint">{pdf.name}</p>}
      <p className="hint">{t('clubdocs.hint')}</p>
      <fieldset><legend>{t('requests.audience')}</legend><p className="hint">{t('requests.everyone')}</p><div className="chips wrap"><button type="button" className={chosenGroups.length?'chip':'chip on'} aria-pressed={!chosenGroups.length} onClick={()=>setChosenGroups([])}>{t('requests.allMembers')}</button>{groups.map(g=><button type="button" className={chosenGroups.includes(g.id)?'chip on':'chip'} aria-pressed={chosenGroups.includes(g.id)} key={g.id} onClick={()=>setChosenGroups(s=>s.includes(g.id)?s.filter(id=>id!==g.id):[...s,g.id])}>{g.name}</button>)}</div></fieldset>
      <label>{t('requests.deadline')}<input type="date" value={deadline} onChange={e=>setDeadline(e.target.value)}/></label>
      {action==='upload'&&<label className="check"><input type="checkbox" checked={review} onChange={e=>setReview(e.target.checked)}/>{t('requests.review')}</label>}
      <p className="hint">{t('requests.publishHint')}</p>
      <div className="actions"><button disabled={busy}>{t('requests.publish')}</button><button type="button" className="secondary" onClick={()=>setAdding(false)}>{t('common.cancel')}</button></div>
    </fieldset></form>}
    {!visible.length&&<p className="hint">{t('requests.empty')}</p>}
    {visible.map(r=>{
      const response=responses.find(s=>s.request_id===r.id&&s.user_id===target)
      const pending=responses.filter(s=>s.request_id===r.id&&s.status==='pending')
      const doc=papers.find(p=>p.id===r.document_id)
      const eligible=people.filter(p=>!r.group_ids.length||memberships.some(g=>g.user_id===p.id&&r.group_ids.includes(g.group_id)))
      const done=response&&['complete','approved'].includes(response.status)
      return <article className="request-card" key={r.id}>
        <h3>{r.title}</h3><p className="hint">{t(`requests.action.${r.action}`)}{!r.active?` · ${t('requests.archived')}`:''}</p>
        {r.instructions&&<p className="request-instructions">{r.instructions}</p>}
        {r.deadline&&<p className={!done&&r.deadline<dayKey(new Date().toISOString())?'error':undefined}>{t('requests.due',{date:formatDateYear(r.deadline)})}</p>}
        {doc&&<button type="button" className="secondary" disabled={busy} onClick={()=>void open(doc.file_path)}>{t('clubdocs.open')}</button>}
        {!manage&&<>
          <p className={`doc-status ${done?'ok':response?.status==='rejected'?'bad':'soon'}`}>{t(`requests.status.${response?.status??'missing'}`)}</p>
          {response&&<p className="hint">{t('requests.recorded',{date:formatDateYear(dayKey(response.submitted_at))})}</p>}
          {response?.review_note&&<p>{response.review_note}</p>}
          {response?.file_path&&<button type="button" className="secondary" disabled={busy} onClick={()=>void open(response.file_path!)}>{t('requests.myFile')}</button>}
          {r.active&&target===profile?.id&&!isStaff&&(!response||response.status==='rejected')&&<>
            {r.action==='upload'?<label className="button file secondary">{t('requests.chooseFile')}<input type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy} onChange={e=>setFiles(f=>({...f,[r.id]:e.target.files?.[0]}))}/></label>:<label className="check"><input type="checkbox" disabled={busy} checked={checks[r.id]??false} onChange={e=>setChecks(c=>({...c,[r.id]:e.target.checked}))}/>{t(r.action==='read'?'requests.readCheck':'requests.acceptCheck')}</label>}
            {r.action==='upload'&&<p className="hint">{files[r.id]?.name??t('requests.uploadHint')}</p>}
            <button type="button" disabled={busy||(r.action==='upload'?!files[r.id]:!checks[r.id])} onClick={()=>void submit(r)}>{t(r.action==='upload'?'requests.send':'requests.confirm')}</button>
          </>}
        </>}
        {manage&&<>
          <p className="hint">{r.group_ids.length?groups.filter(g=>r.group_ids.includes(g.id)).map(g=>g.name).join(', '):t('requests.allMembers')}</p>
          <p>{t('requests.progress',{n:String(responses.filter(s=>s.request_id===r.id&&eligible.some(p=>p.id===s.user_id)&&['complete','approved'].includes(s.status)).length),pending:String(pending.length),total:String(eligible.length)})}</p>
          <details><summary>{t('requests.memberStatus')}</summary><ul className="request-members">{eligible.map(p=>{const answer=responses.find(s=>s.request_id===r.id&&s.user_id===p.id);return <li key={p.id}><span>{personName(p)}</span><span>{t(`requests.status.${answer?.status??'missing'}`)}</span></li>})}</ul></details>
          {isStaff&&pending.map(s=>{const key=`${r.id}/${s.user_id}`;const person=people.find(p=>p.id===s.user_id);return <div className="request-review" key={key}><h4>{person?personName(person):t('requests.member')}</h4>{s.file_path&&<button type="button" className="secondary" disabled={busy} onClick={()=>void open(s.file_path!)}>{t('clubdocs.open')}</button>}<label>{t('requests.note')}<input maxLength={1000} value={notes[key]??''} onChange={e=>setNotes(n=>({...n,[key]:e.target.value}))}/></label><div className="actions"><button type="button" disabled={busy} onClick={()=>void decide(s,true)}>{t('requests.approve')}</button><button type="button" className="secondary" disabled={busy} onClick={()=>void decide(s,false)}>{t('requests.reject')}</button></div></div>})}
          {isBoard&&r.active&&<ConfirmAction label={t('requests.archive')} title={t('requests.archive')} body={t('requests.archiveBody',{title:r.title})} confirm={t('requests.archive')} disabled={busy} onConfirm={()=>void run(async()=>{const result=await supabase.from('club_requests').update({active:false}).eq('id',r.id).select('id').single();if(result.error)throw result.error;await load()})}/>}
        </>}
      </article>
    })}
  </section>
}
