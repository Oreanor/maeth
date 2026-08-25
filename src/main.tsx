import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { AuthProviderComponent } from './auth/AuthContext'
import { I18nProvider } from './i18n'
import { ThemeProvider } from './theme'
import { SkinProvider } from './skin'
import { BoardViewProvider } from './boardView'
import { ChatSettingsProvider } from './chat/ChatSettings'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <I18nProvider>
          <BoardViewProvider>
            <SkinProvider>
              <ChatSettingsProvider>
                <AuthProviderComponent>
                  <App />
                </AuthProviderComponent>
              </ChatSettingsProvider>
            </SkinProvider>
          </BoardViewProvider>
        </I18nProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
