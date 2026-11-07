import { useEffect, useState } from 'react'

export default function OwnerPortal({ onClose, onAuthenticated }) {
  const [setupRequired, setSetupRequired] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const supported = typeof window !== 'undefined' && Boolean(window.PublicKeyCredential)

  useEffect(() => {
    fetch('/api/v1/auth/admin/passkey/status')
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error?.message ?? 'Owner portal is unavailable')
        setSetupRequired(result.setupRequired)
      })
      .catch((exception) => setError(exception.message))
  }, [])

  async function post(url, body) {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error?.message ?? 'Passkey request failed')
    return result
  }

  async function setupPasskey(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget).entries())
      const { challengeId, options } = await post('/api/v1/auth/admin/passkey/setup/options', values)
      const { startRegistration } = await import('@simplewebauthn/browser')
      const response = await startRegistration({ optionsJSON: options })
      const result = await post('/api/v1/auth/admin/passkey/setup/verify', { challengeId, response })
      onAuthenticated(result)
    } catch (exception) {
      setError(exception.message ?? 'Passkey setup was cancelled')
    } finally {
      setBusy(false)
    }
  }

  async function signInWithPasskey() {
    setBusy(true)
    setError('')
    try {
      const { challengeId, options } = await post('/api/v1/auth/admin/passkey/login/options', {})
      const { startAuthentication } = await import('@simplewebauthn/browser')
      const response = await startAuthentication({ optionsJSON: options })
      const result = await post('/api/v1/auth/admin/passkey/login/verify', { challengeId, response })
      onAuthenticated(result)
    } catch (exception) {
      setError(exception.message ?? 'Passkey sign-in was cancelled')
    } finally {
      setBusy(false)
    }
  }

  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="auth-dialog owner-passkey-dialog" role="dialog" aria-modal="true" aria-labelledby="owner-passkey-title">
      <button className="icon-button auth-close" onClick={onClose} aria-label="Close owner portal"><CloseIcon /></button>
      <p className="eyebrow"><span /> PRIVATE ACCESS</p><h2 id="owner-passkey-title">Owner portal.</h2>
      <p className="auth-intro">{setupRequired ? 'Create your passkey using the one-time setup credentials.' : 'Sign in to your store using your passkey.'}</p>
      {!supported && <p className="form-error" role="alert">This browser does not support passkeys.</p>}
      {setupRequired === null ? error ? <p className="form-error" role="alert">{error}</p> : <p className="panel-loading">Checking owner access...</p> : setupRequired ? <form className="auth-form" onSubmit={setupPasskey}>
        <label>Owner email<input name="email" type="email" required autoComplete="username" /></label>
        <label>One-time setup password<input name="password" type="password" required autoComplete="current-password" /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button auth-submit" disabled={busy || !supported}>{busy ? 'Creating passkey...' : 'Create owner passkey'} <KeyIcon /></button>
      </form> : <div className="owner-passkey-login">
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button auth-submit" onClick={() => void signInWithPasskey()} disabled={busy || !supported}>{busy ? 'Waiting for passkey...' : 'Continue with passkey'} <KeyIcon /></button>
      </div>}
      <p className="auth-note">Your passkey stays on your device. Owner password sign-in is disabled after setup.</p>
    </section>
  </div>
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
}

function KeyIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8 2 2-2 2 2 2-3 3-2-2-2 2" /></svg>
}
