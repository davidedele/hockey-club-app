import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

interface Crumb {
  leaf: string
  setLeaf: (text: string) => void
}

const Ctx = createContext<Crumb>({ leaf: '', setLeaf: () => undefined })

// The last step of the breadcrumb, which a page can name (for example the title of an event).
export function CrumbProvider({ children }: { children: ReactNode }) {
  const [leaf, setLeaf] = useState('')
  return <Ctx.Provider value={{ leaf, setLeaf }}>{children}</Ctx.Provider>
}

export const useCrumbLeaf = () => useContext(Ctx).leaf

export function useCrumb(text: string) {
  const { setLeaf } = useContext(Ctx)
  useEffect(() => {
    setLeaf(text)
    return () => setLeaf('')
  }, [text, setLeaf])
}
