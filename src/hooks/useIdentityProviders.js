import { useEffect, useRef, useState } from 'react'

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
const appleClientId = import.meta.env.VITE_APPLE_CLIENT_ID
const appleRedirectUri = import.meta.env.VITE_APPLE_REDIRECT_URI ?? window.location.origin

export default function useIdentityProviders(onSocialAuth) {
  const [googleReady, setGoogleReady] = useState(false)
  const [appleReady, setAppleReady] = useState(false)
  const authHandler = useRef(onSocialAuth)

  useEffect(() => { authHandler.current = onSocialAuth }, [onSocialAuth])

  useEffect(() => {
    let mounted = true
    if (googleClientId) loadGoogle(setGoogleReady, authHandler, () => mounted)
    if (appleClientId) loadApple(setAppleReady, authHandler, () => mounted)
    return () => { mounted = false }
  }, [])

  return { googleReady, appleReady, startAppleSignIn: () => window.AppleID.auth.signIn(), authHandler }
}

function loadGoogle(setReady, authHandler, isMounted) {
  const script = document.querySelector('#google-identity-script') ?? document.createElement('script')
  script.id = 'google-identity-script'
  script.src = 'https://accounts.google.com/gsi/client'
  script.async = true
  script.onload = () => {
    if (!isMounted() || !window.google?.accounts?.id) return
    initializeGoogle(authHandler)
    setReady(true)
  }
  if (!script.isConnected) document.head.appendChild(script)
  else if (window.google?.accounts?.id) {
    initializeGoogle(authHandler)
    requestAnimationFrame(() => { if (isMounted()) setReady(true) })
  }
}

function initializeGoogle(authHandler) {
  window.google.accounts.id.initialize({
    client_id: googleClientId,
    callback: ({ credential }) => { if (credential) void authHandler.current('google', credential) },
  })
}

function loadApple(setReady, authHandler, isMounted) {
  const script = document.querySelector('#apple-identity-script') ?? document.createElement('script')
  script.id = 'apple-identity-script'
  script.src = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js'
  script.async = true
  script.onload = () => {
    if (!isMounted() || !window.AppleID?.auth) return
    window.AppleID.auth.init({ clientId: appleClientId, scope: 'name email', redirectURI: appleRedirectUri, usePopup: true })
    setReady(true)
  }
  if (!script.isConnected) document.head.appendChild(script)
  else if (window.AppleID?.auth) {
    window.AppleID.auth.init({ clientId: appleClientId, scope: 'name email', redirectURI: appleRedirectUri, usePopup: true })
    requestAnimationFrame(() => { if (isMounted()) setReady(true) })
  }
}
