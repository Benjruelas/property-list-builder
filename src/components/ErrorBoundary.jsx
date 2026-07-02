import { Component } from 'react'
import { reportError } from '../utils/errorTracking'

export class ErrorBoundary extends Component {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    reportError(error, { componentStack: info?.componentStack })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, fontFamily: 'system-ui', textAlign: 'center', color: '#fff' }}>
          <h2>Something went wrong</h2>
          <button onClick={() => this.setState({ hasError: false })} style={{ marginTop: 12, padding: '8px 16px' }}>
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
