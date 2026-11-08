import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import AuthDialog from './components/AuthDialog.jsx'
import FeatureDrawer, { FeatureTab } from './components/FeatureDrawer.jsx'
import InitialLoadingScreen from './components/InitialLoadingScreen.jsx'
import SidePanel from './components/SidePanel.jsx'
import SiteFooter from './components/SiteFooter.jsx'
import SiteHeader from './components/SiteHeader.jsx'
import { AtelierSection, CollectionSection, HeroSection, ServiceSection } from './components/StorefrontSections.jsx'
import { getAccessToken, sampleProducts } from './data/storefront.js'

const OwnerPortal = lazy(() => import('./OwnerPortal.jsx'))

export default function App() {
  const [theme, setTheme] = useState(() => window.localStorage.getItem('asv.theme') ?? 'light')
  const [scrollRevealsEnabled, setScrollRevealsEnabled] = useState(() => window.localStorage.getItem('asv.scrollReveals') !== 'false')
  const [backendStatus, setBackendStatus] = useState('checking')
  const [products, setProducts] = useState(sampleProducts)
  const [catalogMode, setCatalogMode] = useState('preview')
  const [heroImageReady, setHeroImageReady] = useState(false)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('All pairs')
  const [cart, setCart] = useState([])
  const [drawer, setDrawer] = useState(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState('login')
  const [authError, setAuthError] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [account, setAccount] = useState(() => {
    const saved = window.localStorage.getItem('asv.account')
    try { return saved ? JSON.parse(saved) : null } catch { return null }
  })
  const [toast, setToast] = useState('')
  const [featureDrawerOpen, setFeatureDrawerOpen] = useState(false)
  const [ownerPortalOpen, setOwnerPortalOpen] = useState(false)
  const featureTabRef = useRef(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('asv.theme', theme)
  }, [theme])

  useEffect(() => {
    const fallback = window.setTimeout(() => setHeroImageReady(true), 1800)
    return () => window.clearTimeout(fallback)
  }, [])

  useEffect(() => {
    window.localStorage.setItem('asv.scrollReveals', String(scrollRevealsEnabled))
  }, [scrollRevealsEnabled])

  useEffect(() => {
    if (!featureDrawerOpen) return undefined
    const featureTab = featureTabRef.current
    document.querySelector('#feature-drawer input')?.focus()
    const handleDrawerKeys = (event) => {
      if (event.key === 'Escape') {
        setFeatureDrawerOpen(false)
        return
      }
      if (event.key !== 'Tab') return

      const focusable = document.querySelectorAll('#feature-drawer button:not(:disabled), #feature-drawer input:not(:disabled)')
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    window.addEventListener('keydown', handleDrawerKeys)
    return () => {
      window.removeEventListener('keydown', handleDrawerKeys)
      if (featureTab) requestAnimationFrame(() => featureTab.focus())
    }
  }, [featureDrawerOpen])

  useLayoutEffect(() => {
    if (!scrollRevealsEnabled || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return undefined

    const sections = document.querySelectorAll('.site-shell main > section')
    const revealTargets = []

    sections.forEach((section) => {
      const components = [...section.children]
      const repeatedItems = [...section.querySelectorAll('.product-card, .service-grid > article')]

      components.forEach((component, index) => {
        component.style.setProperty('--scroll-reveal-delay', `${index * 80}ms`)
        revealTargets.push(component)
      })

      repeatedItems.forEach((item, index) => {
        item.style.setProperty('--scroll-reveal-delay', `${index * 80}ms`)
        revealTargets.push(item)
      })
    })
    let previousScrollY = window.scrollY
    let scrollDirection = 'up'

    revealTargets.forEach((target) => {
      const bounds = target.getBoundingClientRect()
      const isVisible = bounds.bottom > 0 && bounds.top < window.innerHeight
      target.dataset.scrollDirection = isVisible || bounds.top >= window.innerHeight ? 'up' : 'down'
      target.dataset.scrollState = isVisible ? 'visible' : bounds.top >= window.innerHeight ? 'before' : 'after'
      target.dataset.scrollReveal = ''
    })

    const updateScrollDirection = () => {
      const currentScrollY = window.scrollY
      if (currentScrollY !== previousScrollY) scrollDirection = currentScrollY > previousScrollY ? 'up' : 'down'
      previousScrollY = currentScrollY
    }

    window.addEventListener('scroll', updateScrollDirection, { passive: true })
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const target = entry.target

        if (entry.isIntersecting) {
          target.dataset.scrollDirection = scrollDirection
          target.dataset.scrollState = 'visible'
        } else if (target.dataset.scrollState === 'visible') {
          target.dataset.scrollDirection = scrollDirection
          target.dataset.scrollState = scrollDirection === 'up' ? 'after' : 'before'
        }
      })
    }, { threshold: 0.02, rootMargin: '6% 0px' })

    revealTargets.forEach((target) => observer.observe(target))

    return () => {
      window.removeEventListener('scroll', updateScrollDirection)
      observer.disconnect()
      revealTargets.forEach((target) => {
        delete target.dataset.scrollDirection
        delete target.dataset.scrollState
        delete target.dataset.scrollReveal
        target.style.removeProperty('--scroll-reveal-delay')
      })
    }
  }, [catalogMode, products, scrollRevealsEnabled])

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/health', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Backend unavailable')
        setBackendStatus('online')
      })
      .catch((error) => { if (error.name !== 'AbortError') setBackendStatus('offline') })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/v1/products?page=1&pageSize=24&sort=newest', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Catalog unavailable')
        const result = await response.json()
        if (!Array.isArray(result.items)) throw new Error('Invalid catalog response')
        setProducts(result.items.length ? result.items : sampleProducts)
        setCatalogMode(result.items.length ? 'live' : 'preview')
      })
      .catch((error) => { if (error.name !== 'AbortError') setCatalogMode('preview') })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!getAccessToken() || account?.type !== 'customer') return undefined
    const controller = new AbortController()
    fetch('/api/v1/cart', { headers: { Authorization: `Bearer ${getAccessToken()}` }, signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return
        const result = await response.json()
        setCart(result.items ?? [])
      })
      .catch(() => {})
    return () => controller.abort()
  }, [account])

  useEffect(() => {
    if (!toast) return undefined
    const timeout = window.setTimeout(() => setToast(''), 2600)
    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    const openOrders = () => setDrawer('orders')
    const openOwner = () => setDrawer('owner')
    const handleToast = (event) => setToast(event.detail ?? '')
    window.addEventListener('asv-open-orders', openOrders)
    window.addEventListener('asv-open-owner', openOwner)
    window.addEventListener('asv-toast', handleToast)
    return () => {
      window.removeEventListener('asv-open-orders', openOrders)
      window.removeEventListener('asv-open-owner', openOwner)
      window.removeEventListener('asv-toast', handleToast)
    }
  }, [])

  const categories = useMemo(() => ['All pairs', ...new Set(products.map((product) => product.categoryName).filter(Boolean))], [products])
  const cartCount = cart.reduce((total, item) => total + Number(item.quantity ?? 1), 0)

  async function addToCart(product, variant) {
    if (catalogMode !== 'live') {
      setToast('Preview collection only. Connect the catalog to place an order.')
      return
    }
    if (!account || account.type !== 'customer') {
      setAuthMode('login')
      setAuthOpen(true)
      return
    }
    if (!variant) {
      setToast('This pair has no available sizes right now.')
      return
    }
    try {
      const response = await fetch('/api/v1/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken()}` },
        body: JSON.stringify({ variantId: variant.id, quantity: 1 }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Unable to add this pair')
      const cartResponse = await fetch('/api/v1/cart', { headers: { Authorization: `Bearer ${getAccessToken()}` } })
      if (cartResponse.ok) setCart((await cartResponse.json()).items ?? [])
      setToast(`${product.name} added to your bag`)
      setDrawer('bag')
    } catch (error) {
      setToast(error.message)
    }
  }

  async function removeCartItem(itemId) {
    const response = await fetch(`/api/v1/cart/items/${itemId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${getAccessToken()}` },
    })
    if (response.ok) setCart((items) => items.filter((item) => item.id !== itemId))
  }

  async function submitAuth(event) {
    event.preventDefault()
    setAuthBusy(true)
    setAuthError('')
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries())
    const path = `/api/v1/auth/customer/${authMode === 'register' ? 'register' : 'login'}`
    try {
      const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Unable to sign in')
      acceptAuthResult(result, 'customer')
    } catch (error) {
      setAuthError(error.message)
    } finally {
      setAuthBusy(false)
    }
  }

  async function submitSocialAuth(provider, credential) {
    setAuthBusy(true)
    setAuthError('')
    try {
      const response = await fetch(`/api/v1/auth/customer/${provider}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? `${provider} sign-in failed`)
      acceptAuthResult(result, 'customer')
    } catch (error) {
      setAuthError(error.message)
    } finally {
      setAuthBusy(false)
    }
  }

  function acceptAuthResult(result, type) {
    const identity = { ...result.account, type }
    window.localStorage.setItem('asv.accessToken', result.accessToken)
    window.localStorage.setItem('asv.refreshToken', result.refreshToken)
    window.localStorage.setItem('asv.account', JSON.stringify(identity))
    setAccount(identity)
    setAuthOpen(false)
    setOwnerPortalOpen(false)
    if (type === 'admin') setDrawer('owner')
    setToast(`Welcome${identity.firstName ? `, ${identity.firstName}` : ''}`)
  }

  function signOut() {
    window.localStorage.removeItem('asv.accessToken')
    window.localStorage.removeItem('asv.refreshToken')
    window.localStorage.removeItem('asv.account')
    setAccount(null)
    setCart([])
    setDrawer(null)
    setToast('You are signed out')
  }

  function openAuth() {
    setAuthMode('login')
    setAuthError('')
    setAuthOpen(true)
  }

  return (
    <div className="site-shell">
      {!heroImageReady && <InitialLoadingScreen />}
      <SiteHeader theme={theme} setTheme={setTheme} account={account} setDrawer={setDrawer} cartCount={cartCount} openAuth={openAuth} />
      <main id="top">
        <HeroSection onHeroImageReady={() => setHeroImageReady(true)} />
        <CollectionSection catalogMode={catalogMode} categories={categories} activeCategory={activeCategory} onCategoryChange={setActiveCategory} search={search} onSearchChange={setSearch} products={products} onAdd={addToCart} />
        <AtelierSection />
        <ServiceSection />
      </main>
      <SiteFooter onOwnerPortal={() => setOwnerPortalOpen(true)} />
      <FeatureTab buttonRef={featureTabRef} onOpen={() => setFeatureDrawerOpen(true)} isOpen={featureDrawerOpen} />
      <FeatureDrawer open={featureDrawerOpen} onClose={() => setFeatureDrawerOpen(false)} scrollRevealsEnabled={scrollRevealsEnabled} onScrollRevealsChange={setScrollRevealsEnabled} theme={theme} setTheme={setTheme} />
      {drawer && <SidePanel type={drawer} account={account} cart={cart} onClose={() => setDrawer(null)} onRemove={removeCartItem} onSignOut={signOut} onOrderPlaced={() => { setCart([]); setDrawer(null); setToast('Order placed. Payment is pending.') }} />}
      {authOpen && <AuthDialog mode={authMode} busy={authBusy} error={authError} onModeChange={setAuthMode} onClose={() => setAuthOpen(false)} onSubmit={submitAuth} onSocialAuth={submitSocialAuth} />}
      {ownerPortalOpen && <Suspense fallback={<div className="dialog-backdrop"><div className="auth-dialog owner-passkey-dialog" role="status">Opening owner portal...</div></div>}><OwnerPortal onClose={() => setOwnerPortalOpen(false)} onAuthenticated={(result) => acceptAuthResult(result, 'admin')} /></Suspense>}
      {toast && <div className="toast-message" role="status">{toast}</div>}
    </div>
  )
}


