import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import { AppProvider } from './state'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
)
