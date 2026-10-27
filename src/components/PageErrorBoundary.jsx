import React from 'react'
import { RefreshCcw, TriangleAlert } from 'lucide-react'
import { captureClientError } from '../services/monitoringService'

export default class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  componentDidCatch(error, info) {
    console.error('Page render error', error, info)
    captureClientError(error, {
      source: 'react.error-boundary',
      componentStack: info?.componentStack || '',
      metadata: { resetKey: this.props.resetKey || '' },
    })
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <section className="route-error-card">
        <span className="route-error-card__icon"><TriangleAlert size={26} /></span>
        <div>
          <strong>تعذر عرض الصفحة</strong>
          <p>حصل خطأ مؤقت أثناء الانتقال. اضغط إعادة المحاولة بدل ما تظهر صفحة بيضاء.</p>
          <small>{this.state.error?.message || 'Unknown render error'}</small>
        </div>
        <button className="btn btn-primary" type="button" onClick={() => this.setState({ error: null })}><RefreshCcw size={16} /> إعادة المحاولة</button>
      </section>
    )
  }
}
