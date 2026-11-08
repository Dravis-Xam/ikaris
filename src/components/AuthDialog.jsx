import { useState } from 'react'
import useIdentityProviders from '../hooks/useIdentityProviders.js'
import { AppleIcon, ArrowIcon, CloseIcon, GoogleIcon } from './icons.jsx'

export default function AuthDialog({ mode, busy, error, onModeChange, onClose, onSubmit, onSocialAuth }) {
  const [providerError, setProviderError] = useState('')
  const { googleReady, appleReady, startAppleSignIn, authHandler } = useIdentityProviders(onSocialAuth)

  async function continueWithApple() {
    setProviderError('')
    try {
      const result = await startAppleSignIn()
      const credential = result?.authorization?.id_token
      if (!credential) throw new Error('Apple did not return an identity token')
      await authHandler.current('apple', credential)
    } catch (exception) {
      if (exception?.error !== 'popup_closed_by_user') setProviderError(exception.message ?? 'Apple sign-in could not be completed')
    }
  }

  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button className="icon-button auth-close" onClick={onClose} aria-label="Close sign in"><CloseIcon /></button>
      <p className="eyebrow"><span /> A SOLE VENNETTA</p><h2 id="auth-title">{mode === 'register' ? 'Your next chapter.' : 'Welcome back.'}</h2>
      <p className="auth-intro">A considered place for the pairs you love.</p>
      <div className="auth-mode"><button className={mode === 'login' ? 'is-current' : ''} onClick={() => onModeChange('login')}>Sign in</button><button className={mode === 'register' ? 'is-current' : ''} onClick={() => onModeChange('register')}>Create account</button></div>
      <div className="social-auth">
        <button className="social-auth-button" disabled={!googleReady || busy} onClick={() => { setProviderError(''); window.google.accounts.id.prompt() }}><GoogleIcon /><span>Continue with Google</span></button>
        <button className="social-auth-button" disabled={!appleReady || busy} onClick={() => void continueWithApple()}><AppleIcon /><span>Continue with Apple</span></button>
      </div>
      {(!googleReady || !appleReady) && <p className="provider-setup-note">Social sign-in becomes available when its provider is configured.</p>}
      <div className="auth-divider"><span>or with email</span></div>
      <form className="auth-form" onSubmit={onSubmit}>
        {mode === 'register' && <div className="auth-name-fields"><label>First name<input name="firstName" required autoComplete="given-name" /></label><label>Last name<input name="lastName" required autoComplete="family-name" /></label></div>}
        <label>Email address<input name="email" type="email" required autoComplete="email" /></label>
        <label>Password<input name="password" type="password" required minLength={mode === 'register' ? 12 : 1} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} /></label>
        {(error || providerError) && <p className="form-error" role="alert">{error || providerError}</p>}
        <button className="primary-button auth-submit" disabled={busy}>{busy ? 'One moment...' : mode === 'register' ? 'Create your account' : 'Sign in'} <ArrowIcon /></button>
      </form>
      <p className="auth-note">By continuing, you agree to our terms and privacy policy.</p>
    </section>
  </div>
}

function loadGoogleIdentity(setReady, callbackRef, isActive) {
  const script = document.querySelector('#google-identity-script') ?? document.createElement('script')
  script.id = 'google-identity-script'
  script.src = 'https://accounts.google.com/gsi/client'
  script.async = true
  script.onload = () => {
    if (!isActive() || !window.google?.accounts?.id) return
    window.google.accounts.id.initialize({ client_id: googleClientId, callback: ({ credential }) => {
      if (credential) void callbackRef.current('google', credential)
    } })
    setReady(true)
  }
  if (!script.isConnected) document.head.appendChild(script)
  else if (window.google?.accounts?.id) {
    window.google.accounts.id.initialize({ client_id: googleClientId, callback: ({ credential }) => {
      if (credential) void callbackRef.current('google', credential)
    } })
    requestAnimationFrame(() => { if (isActive()) setReady(true) })
  }
}
