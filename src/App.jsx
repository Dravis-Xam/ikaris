import { useEffect, useState } from 'react'

export default function App() {
  const [backendStatus, setBackendStatus] = useState('Checking...')

  useEffect(() => {
    const controller = new AbortController()

    fetch('/api/health', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Backend request failed')
        return response.json()
      })
      .then(({ status }) => setBackendStatus(status === 'ok' ? 'Connected' : 'Unavailable'))
      .catch((error) => {
        if (error.name !== 'AbortError') setBackendStatus('Unavailable')
      })

    return () => controller.abort()
  }, [])

  return (
    <main>
      <h1>Diana Phone Shop</h1>
      <p>Backend: <span role="status">{backendStatus}</span></p>
    </main>
  )
}
