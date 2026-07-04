import React from 'react'
import ReactDOM from 'react-dom/client'
import App, { AppWithPublicFormRoute } from './App.jsx'
import './styles/ui-theme.css'
import './styles/ui-theme-light-readability.css'
import './index.css'
import './styles/quote-panel-actions.css'
import { applyUiThemeFromStorage } from './utils/uiTheme'
import { AuthProvider } from './contexts/AuthContext'
import { initErrorTracking } from './utils/errorTracking'

initErrorTracking()
applyUiThemeFromStorage()
import { NavigationProvider } from './navigation/NavigationContext'
import { ErrorBoundary } from './components/ErrorBoundary'

if ('serviceWorker' in navigator) {
  const registerServiceWorker = () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            registration.update().catch(() => {})
          }
        })
      })
      .catch((err) => {
        console.warn('Service worker registration failed:', err?.message || err)
      })
  }
  if (document.readyState === 'complete') {
    registerServiceWorker()
  } else {
    window.addEventListener('load', registerServiceWorker)
  }
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
