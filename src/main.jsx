import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import { AuthProvider } from './context/AuthContext'
import { CycleProvider } from './context/CycleContext'
import { FeedbackProvider } from './context/FeedbackContext'
import { ThemeProvider } from './context/ThemeContext'
import App from './App'
import { installGlobalMonitoring } from './services/monitoringService'
import './styles/theme.css'
import './styles/app.css'
import './styles/project-progress.css'

installGlobalMonitoring()

const preventNumberWheelChange = (event) => {
  const target = event.target
  if (!(target instanceof HTMLInputElement) || target.type !== 'number') return
  if (document.activeElement !== target) return

  // Remove focus before the browser applies its native wheel increment.
  // The wheel event can then continue scrolling the page normally.
  target.blur()
}

document.addEventListener('wheel', preventNumberWheelChange, { capture: true, passive: true })

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ThemeProvider>
            <FeedbackProvider>
              <CycleProvider>
                <App />
              </CycleProvider>
            </FeedbackProvider>
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
