import { useEffect, useRef, useState, type ReactNode } from 'react'

// A row of tab links that can be wider than the window (phones). When more tabs exist beyond an edge,
// a soft fade shows on that edge, and the active tab is brought into view when the page opens or the tab changes.
export default function TabStrip(props: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  const [more, setMore] = useState({ left: false, right: false })

  useEffect(() => {
    const nav = ref.current
    if (!nav) return
    const update = () => {
      const left = nav.scrollLeft > 1
      const right = nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1
      setMore((m) => (m.left === left && m.right === right ? m : { left, right }))
    }
    const reveal = () => {
      const tab = nav.querySelector<HTMLElement>('[aria-current]')
      if (!tab) return
      const room = 16
      if (tab.offsetLeft - room < nav.scrollLeft) nav.scrollLeft = Math.max(0, tab.offsetLeft - room)
      else if (tab.offsetLeft + tab.offsetWidth + room > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = tab.offsetLeft + tab.offsetWidth + room - nav.clientWidth
    }
    reveal()
    update()
    nav.addEventListener('scroll', update, { passive: true })
    // The strip changes width when the window does, and each tab when the fonts load or the text changes.
    const observer = new ResizeObserver(() => { reveal(); update() })
    const observeTabs = () => { observer.disconnect(); observer.observe(nav); for (const tab of Array.from(nav.children)) observer.observe(tab) }
    observeTabs()
    const watch = new MutationObserver(() => { observeTabs(); reveal(); update() })
    watch.observe(nav, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-current'] })
    return () => { nav.removeEventListener('scroll', update); observer.disconnect(); watch.disconnect() }
  }, [])

  return (
    <div className="tabstrip" data-more-left={more.left} data-more-right={more.right}>
      <nav ref={ref} className="ev-tabs" aria-label={props.label}>{props.children}</nav>
    </div>
  )
}
