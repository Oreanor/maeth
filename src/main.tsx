import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { AuthProviderComponent } from './auth/AuthContext'
import { initTelegram } from './platform/telegram'
import './index.css'

// Tell Telegram we're ready and expand to full height (no-op in a browser).
initTelegram()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProviderComponent>
        <App />
      </AuthProviderComponent>
    </BrowserRouter>
  </StrictMode>,
)
