import React from 'react'
import ReactDOM from 'react-dom/client'
import App, { AppWithPublicFormRoute } from './App.jsx'
import './index.css'
import { AuthProvider } from './contexts/AuthContext'
import { NavigationProvider } from './navigation/NavigationContext'
import { ErrorBoundary } from './components/ErrorBoundary'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <NavigationProvider>
          <AppWithPublicFormRoute />
        </NavigationProvider>
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
