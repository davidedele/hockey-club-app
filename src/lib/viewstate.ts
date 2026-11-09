import { useState, useCallback, useEffect, useLayoutEffect, useRef, type SetStateAction } from 'react'
import { useSession } from './session'
export function useViewState<T>(key: string, initial: T | (() => T), valid?: (value: unknown) => boolean) {
  const { profile, view } = useSession()
  const storageKey = `view-v1:${profile?.id ?? 'guest'}:${view}:${key}`
  const fallback = () => typeof initial === 'function' ? (initial as () => T)() : initial
  const read = () => { try { const raw = sessionStorage.getItem(storageKey); if(raw !== null){ const value: unknown = JSON.parse(raw); if(!valid || valid(value)) return value as T } } catch { /* Memory remains available when storage is blocked. */ } return fallback() }
  const [state, set] = useState<T>(read)
  const last = useRef(storageKey)
  useEffect(() => { if(last.current !== storageKey){last.current=storageKey;set(read())} }, [storageKey])
  const update = useCallback((value: SetStateAction<T>) => set(current => { const next = typeof value === 'function' ? (value as (v:T)=>T)(current) : value; try {sessionStorage.setItem(storageKey, JSON.stringify(next))} catch {} return next }), [storageKey])
  return [state, update] as const
}
export function useReturnScroll(key: string, ready: boolean) {
  const [saved, save] = useViewState(key, 0, x=>typeof x==='number' && x>=0)
  const restored = useRef(false)
  useLayoutEffect(()=>{if(!ready || restored.current)return;restored.current=true; const frame=requestAnimationFrame(()=>window.scrollTo(0,saved));return ()=>cancelAnimationFrame(frame)},[ready,saved])
  useEffect(()=>{if(!ready)return; const remember=()=>save(window.scrollY);window.addEventListener('scroll',remember,{passive:true});return ()=>window.removeEventListener('scroll',remember)},[ready,save])
}
export function useChangeEffect(effect:()=>void, value:unknown){const previous=useRef(value);useEffect(()=>{if(previous.current!==value){previous.current=value;effect()}},[value])}
