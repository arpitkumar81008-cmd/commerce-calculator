import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { CustomerProvider } from './CustomerContext'
import { AdminProvider } from './AdminContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AdminProvider>
        <CustomerProvider>
          <App />
        </CustomerProvider>
      </AdminProvider>
    </BrowserRouter>
  </StrictMode>,
)
