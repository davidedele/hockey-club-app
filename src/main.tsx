import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ClubProvider } from './lib/club'
import { SessionProvider } from './lib/session'
import { startPwa } from './lib/pwa'
import './styles.css'

startPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ClubProvider>
        <SessionProvider>
          <App />
        </SessionProvider>
      </ClubProvider>
    </BrowserRouter>
  </StrictMode>,
)
