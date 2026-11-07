import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const OwnerPortal = lazy(() => import('./OwnerPortal.jsx'))
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
const appleClientId = import.meta.env.VITE_APPLE_CLIENT_ID
const appleRedirectUri = import.meta.env.VITE_APPLE_REDIRECT_URI ?? window.location.origin

const sampleProducts = [
  {
    id: 'editorial-01',
    name: 'The Vennetta Runner',
    brand: 'A Sole Vennetta',
    categoryName: 'New arrivals',
    basePrice: '18900.00',
    images: ['/images/vennetta-runner.jpg'],
    variants: [
      { id: 'ven-runner-37', size: 37, stockQuantity: 6, color: 'Blush / chalk' },
      { id: 'ven-runner-38', size: 38, stockQuantity: 4, color: 'Blush / chalk' },
      { id: 'ven-runner-39', size: 39, stockQuantity: 7, color: 'Blush / chalk' },
      { id: 'ven-runner-40', size: 40, stockQuantity: 5, color: 'Blush / chalk' },
    ],
    status: 'active',
    note: 'Blush / chalk',
    palette: { upper: '#f6eee7', accent: '#bc7d69', sole: '#d9bb91', detail: '#f8f2ee' },
  },
  {
    id: 'editorial-02',
    name: 'Form 02 Leather',
    brand: 'A Sole Vennetta',
    categoryName: 'Leather',
    basePrice: '22500.00',
    images: ['/images/form-leather.jpg'],
    variants: [
      { id: 'form-leather-38', size: 38, stockQuantity: 3, color: 'Ivory / warm sand' },
      { id: 'form-leather-39', size: 39, stockQuantity: 5, color: 'Ivory / warm sand' },
      { id: 'form-leather-40', size: 40, stockQuantity: 4, color: 'Ivory / warm sand' },
      { id: 'form-leather-41', size: 41, stockQuantity: 2, color: 'Ivory / warm sand' },
    ],
    status: 'active',
    note: 'Ivory / warm sand',
    palette: { upper: '#f3ecdf', accent: '#db9a74', sole: '#d5c3a7', detail: '#f5efe6' },
  },
  {
    id: 'editorial-03',
    name: 'Studio Court',
    brand: 'A Sole Vennetta',
    categoryName: 'Everyday',
    basePrice: '17500.00',
    images: ['/images/studio-court.jpg'],
    variants: [
      { id: 'studio-court-37', size: 37, stockQuantity: 4, color: 'White / burgundy' },
      { id: 'studio-court-38', size: 38, stockQuantity: 6, color: 'White / burgundy' },
      { id: 'studio-court-39', size: 39, stockQuantity: 7, color: 'White / burgundy' },
    ],
    status: 'active',
    note: 'White / burgundy',
    palette: { upper: '#f6f1ee', accent: '#a9504e', sole: '#cdb89e', detail: '#f8f4f0' },
  },
  {
    id: 'editorial-04',
    name: 'Sculpt 01',
    brand: 'A Sole Vennetta',
    categoryName: 'New arrivals',
    basePrice: '21000.00',
    images: ['/images/sculpt-01.jpg'],
    variants: [
      { id: 'sculpt-01-38', size: 38, stockQuantity: 2, color: 'Soft blush / chalk' },
      { id: 'sculpt-01-39', size: 39, stockQuantity: 6, color: 'Soft blush / chalk' },
      { id: 'sculpt-01-40', size: 40, stockQuantity: 5, color: 'Soft blush / chalk' },
      { id: 'sculpt-01-41', size: 41, stockQuantity: 3, color: 'Soft blush / chalk' },
    ],
    status: 'active',
    note: 'Soft blush / chalk',
    palette: { upper: '#efe7e2', accent: '#dce0df', sole: '#c9b5a3', detail: '#f7f2ee' },
  },
]

function formatPrice(value) {
  const number = Number(value)
  return Number.isFinite(number) ? new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(number) : value
}

function getAccessToken() {
  return window.localStorage.getItem('asv.accessToken')
}

export default function App() {
  const [theme, setTheme] = useState(() => window.localStorage.getItem('asv.theme') ?? 'light')
  const [scrollRevealsEnabled, setScrollRevealsEnabled] = useState(() => window.localStorage.getItem('asv.scrollReveals') !== 'false')
  const [backendStatus, setBackendStatus] = useState('checking')
  const [products, setProducts] = useState(sampleProducts)
  const [catalogMode, setCatalogMode] = useState('loading')
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
  const visibleProducts = useMemo(() => products.filter((product) => {
    const query = search.trim().toLowerCase()
    const matchesText = !query || `${product.name} ${product.brand} ${product.categoryName ?? ''}`.toLowerCase().includes(query)
    const matchesCategory = activeCategory === 'All pairs' || product.categoryName === activeCategory
    return matchesText && matchesCategory
  }), [activeCategory, products, search])
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
      <div className="announcement-bar">
        <span>Complimentary delivery on orders over KSh 20,000</span>
        <span className={`service-indicator service-indicator--${backendStatus}`}><i /> {backendStatus === 'online' && catalogMode === 'live' ? 'Maison online' : 'Maison preview'}</span>
      </div>
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="A Sole Vennetta home">
          <span>A SOLE VENNETTA</span><small>SNEAKERS <b>✦</b> STYLE <b>✦</b> EVERY STEP</small>
        </a>
        <nav className="main-nav" id="main-navigation" aria-label="Main navigation">
          <a href="#collection">The collection</a><a href="#atelier">Our point of view</a><a href="#service">The ASV standard</a>
        </nav>
        <div className="header-actions">
          <button className="icon-button theme-toggle" onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}>{theme === 'light' ? <SunIcon /> : <MoonIcon />}</button>
          {account ? <button className="account-action" onClick={() => setDrawer('account')} aria-label="Open your account"><UserIcon /><span>{account.firstName ?? 'Account'}</span></button> : <button className="icon-button" onClick={() => openAuth()} aria-label="Sign in" title="Sign in"><UserIcon /></button>}
          <button className="bag-action" onClick={() => setDrawer('bag')} aria-label={`Shopping bag, ${cartCount} items`}><BagIcon /><span>Bag</span><b>{String(cartCount).padStart(2, '0')}</b></button>
          <button className="mobile-menu" onClick={() => document.querySelector('.main-nav')?.classList.toggle('main-nav--open')} aria-label="Open navigation" aria-controls="main-navigation"><MenuIcon /></button>
        </div>
      </header>

      <main id="top">
        <section className="hero-section" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow"><span /> Designed to move with you</p>
            <h1 id="hero-title">A quieter kind<br />of <em>statement.</em></h1>
            <p className="hero-description">Considered sneakers for wherever the day takes you. Made to feel like yours, from the very first step.</p>
            <a className="primary-button" href="#collection">Discover the collection <ArrowIcon /></a>
            <div className="hero-proof"><span className="proof-line" /><span>Independent spirit. Intentional design.</span></div>
          </div>
          <div className="hero-visual">
            <div className="hero-index"><span>01</span><i /> BLACK / WHITE / EVERYDAY</div>
            <div className="shoe-showcase shoe-showcase--image">
              <img className="shoe-showcase__image" src="/images/WhatsApp_Image_2026-11-07_at_15.11.08-removebg-preview.png" alt="Black and white Nike sneakers" />
            </div>
            <span className="hero-side-note">FORM FOLLOWS FEELING / 2026</span>
            <div className="hero-caption"><span>BLACK / WHITE RUNNER</span><b>01 / 04</b></div>
          </div>
          <div className="hero-bottomline"><span>Made for the in-between moments.</span><a href="#collection">Scroll to explore <ArrowDownIcon /></a><span>01 — 04</span></div>
        </section>

        <section className="collection-section" id="collection" aria-labelledby="collection-title">
          <div className="section-heading"><div><p className="eyebrow"><span /> A study in everyday</p><h2 id="collection-title">The collection</h2></div><p>Four silhouettes. A hundred ways to make them yours.</p></div>
          {catalogMode === 'preview' && <p className="catalog-note" role="status">A considered preview of the collection. Live product availability appears when the shop catalog is connected.</p>}
          {catalogMode === 'empty' && <p className="catalog-note" role="status">The collection is being prepared. Please visit again soon.</p>}
          <div className="collection-tools">
            <div className="category-tabs" role="tablist" aria-label="Filter collection">{categories.map((category) => <button key={category} className={activeCategory === category ? 'category-tab is-active' : 'category-tab'} onClick={() => setActiveCategory(category)} role="tab" aria-selected={activeCategory === category}>{category}</button>)}</div>
            <label className="search-control"><SearchIcon /><span className="visually-hidden">Search shoes</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find your pair" /></label>
          </div>
          {catalogMode === 'loading' ? <div className="catalog-loading" role="status">Curating the collection...</div> : <div className="product-grid">
            {visibleProducts.map((product, index) => <ProductCard key={product.id} product={product} index={index} preview={catalogMode !== 'live'} onAdd={addToCart} />)}
            {!visibleProducts.length && <div className="empty-search"><SearchIcon /><p>No pairs found. Try another search.</p></div>}
          </div>}
          <a className="text-link collection-more" href="#atelier">A little more about us <ArrowIcon /></a>
        </section>

        <section className="atelier-section" id="atelier">
          <div className="atelier-image" role="img" aria-label="A sculptural sneaker in a quiet studio setting" />
          <div className="atelier-copy"><p className="eyebrow"><span /> Our point of view</p><h2>Less noise.<br /><em>More feeling.</em></h2><p>We believe the right shoe doesn't ask for attention. It earns a place in your everyday: thoughtful materials, familiar comfort, and the kind of detail you notice over time.</p><a className="text-link" href="#service">The ASV standard <ArrowIcon /></a><span className="atelier-index">ASV / NOTES ON MOVEMENT / 001</span></div>
        </section>

        <section className="service-section" id="service"><p className="eyebrow"><span /> The ASV standard</p><div className="service-grid">
          <article><span>01</span><h3>Considered by design</h3><p>Clean lines, balanced proportions, nothing that doesn't belong.</p></article>
          <article><span>02</span><h3>Comfort that stays</h3><p>Everyday cushioning and materials chosen to move with you.</p></article>
          <article><span>03</span><h3>Here for the long walk</h3><p>Timeless forms, made for repeat wear and the miles in between.</p></article>
        </div></section>
      </main>

      <footer className="site-footer"><a className="footer-wordmark" href="#top">A SOLE VENNETTA <small>SNEAKERS ✦ STYLE ✦ EVERY STEP</small></a><span>Designed for your every day.</span><div className="footer-actions"><a href="#collection">The collection</a><button onClick={() => setOwnerPortalOpen(true)}>Owner portal</button><span>© ASV 2026</span></div></footer>
      <button ref={featureTabRef} className="feature-tab" onClick={() => setFeatureDrawerOpen(true)} aria-label="Open feature settings" aria-expanded={featureDrawerOpen} aria-controls="feature-drawer" title="Feature settings"><ChevronLeftIcon /></button>
      {featureDrawerOpen && <div className="feature-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setFeatureDrawerOpen(false) }}>
        <aside className="feature-drawer" id="feature-drawer" role="dialog" aria-modal="true" aria-labelledby="feature-drawer-title">
          <div className="feature-drawer-heading"><div><p className="eyebrow"><span /> PERSONALIZE</p><h2 id="feature-drawer-title">Your view</h2></div><button className="icon-button" onClick={() => setFeatureDrawerOpen(false)} aria-label="Close feature settings"><ChevronRightIcon /></button></div>
          <div className="feature-settings">
            <label className="feature-toggle-row"><span>Scroll reveals</span><span className="feature-switch"><input type="checkbox" checked={scrollRevealsEnabled} onChange={(event) => setScrollRevealsEnabled(event.target.checked)} /><i /></span></label>
            <div className="feature-theme-row"><span>Theme</span><button className="feature-theme-button" onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}>{theme === 'light' ? <MoonIcon /> : <SunIcon />}<span>{theme === 'light' ? 'Dark' : 'Light'}</span></button></div>
          </div>
        </aside>
      </div>}
      {drawer && <SidePanel type={drawer} account={account} cart={cart} onClose={() => setDrawer(null)} onRemove={removeCartItem} onSignOut={signOut} onOrderPlaced={() => { setCart([]); setDrawer(null); setToast('Order placed. Payment is pending.') }} />}
      {authOpen && <AuthDialog mode={authMode} busy={authBusy} error={authError} onModeChange={setAuthMode} onClose={() => setAuthOpen(false)} onSubmit={submitAuth} onSocialAuth={submitSocialAuth} />}
      {ownerPortalOpen && <Suspense fallback={<div className="dialog-backdrop"><div className="auth-dialog owner-passkey-dialog" role="status">Opening owner portal...</div></div>}><OwnerPortal onClose={() => setOwnerPortalOpen(false)} onAuthenticated={(result) => acceptAuthResult(result, 'admin')} /></Suspense>}
      {toast && <div className="toast-message" role="status">{toast}</div>}
    </div>
  )
}

function ProductCard({ product, index, preview, onAdd }) {
  const variants = product.variants ?? []
  const availableVariants = variants.filter((variant) => Number(variant.stockQuantity) > 0)
  const [variantId, setVariantId] = useState(availableVariants[0]?.id ?? '')
  const activeVariant = availableVariants.find((variant) => variant.id === variantId)
  const image = Array.isArray(product.images) ? product.images[0] : product.images?.[0]
  const price = product.discountPrice || product.basePrice
  return <article className="product-card" style={{ '--card-index': index }}>
    <div className="product-image-wrap"><img src={image || sampleProducts[index % sampleProducts.length].images[0]} alt={`${product.name} sneaker`} loading="lazy" />
      {product.discountPrice && <span className="product-badge">A considered price</span>}
      <button className="product-quick-add" onClick={() => onAdd(product, activeVariant)} disabled={preview || !activeVariant} aria-label={`Add ${product.name} to bag`} title={preview ? 'Preview only' : activeVariant ? 'Add to bag' : 'Currently unavailable'}><PlusIcon /></button>
    </div>
    <div className="product-info"><div className="product-title-line"><h3>{product.name}</h3><span>{formatPrice(price)}</span></div>
      <div className="product-meta"><span>{activeVariant ? activeVariant.color : product.note ?? 'Thoughtfully considered'}</span>{availableVariants.length > 0 && <label><span className="visually-hidden">Choose size</span><select value={variantId} onChange={(event) => setVariantId(event.target.value)} aria-label={`Size for ${product.name}`}>{availableVariants.map((variant) => <option value={variant.id} key={variant.id}>EU {variant.size}</option>)}</select></label>}</div>
      {preview && <span className="preview-stock">Preview collection</span>}{!preview && !availableVariants.length && <span className="preview-stock">Currently unavailable</span>}
    </div>
  </article>
}

function SidePanel({ type, account, cart, onClose, onRemove, onSignOut, onOrderPlaced }) {
  const isOrders = type === 'orders'
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(isOrders)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!isOrders || account?.type !== 'customer') return undefined
    const controller = new AbortController()
    fetch('/api/v1/orders?page=1&pageSize=20', { headers: { Authorization: `Bearer ${getAccessToken()}` }, signal: controller.signal })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error?.message ?? 'Orders are unavailable'); setOrders(data.items ?? []) })
      .catch((exception) => { if (exception.name !== 'AbortError') setError(exception.message) })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [account, isOrders])
  return <div className="panel-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <aside className="side-panel" aria-label={isOrders ? 'Your orders' : type === 'account' ? 'Your account' : 'Shopping bag'}>
      <div className="panel-heading"><div><p className="eyebrow"><span /> {isOrders ? 'Your history' : type === 'account' ? 'Your ASV' : type === 'owner' ? 'Private access' : 'Your selection'}</p><h2>{isOrders ? 'Orders' : type === 'account' ? 'Account' : type === 'owner' ? 'Owner studio' : 'The bag'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close panel"><CloseIcon /></button></div>
      {type === 'bag' && <BagCheckoutPanel cart={cart} onClose={onClose} onRemove={onRemove} onOrderPlaced={onOrderPlaced} />}
      {type === 'account' && <div className="account-panel"><div className="account-greeting"><span className="account-avatar">{(account?.firstName ?? account?.fullName ?? 'A').slice(0, 1)}</span><div><h3>{account?.firstName ? `Welcome, ${account.firstName}` : account?.fullName ?? 'Welcome back'}</h3><p>{account?.email}</p></div></div>{account?.type === 'admin' ? <button className="account-menu-row" onClick={() => window.dispatchEvent(new CustomEvent('asv-open-owner'))}>Owner studio <ArrowIcon /></button> : <button className="account-menu-row" onClick={() => window.dispatchEvent(new CustomEvent('asv-open-orders'))}>Order history <ArrowIcon /></button>}<button className="account-menu-row" onClick={onSignOut}>Sign out <ArrowIcon /></button></div>}
      {isOrders && <div className="panel-body">{loading ? <p className="panel-loading">Gathering your order notes...</p> : error ? <div className="panel-empty"><p>{error}</p></div> : !orders.length ? <div className="panel-empty"><PackageIcon /><h3>Nothing on its way just yet.</h3><p>Your next favorite pair is waiting in the collection.</p></div> : orders.map((order) => <article className="order-row" key={order.id}><div><span>{order.orderNumber}</span><small>{new Date(order.createdAt).toLocaleDateString()}</small></div><b>{formatPrice(order.totalAmount)}</b><em>{order.status?.replaceAll('_', ' ')}</em></article>)}</div>}
      {type === 'owner' && <OwnerStudio token={getAccessToken()} onSignOut={onSignOut} />}
      {type !== 'owner' && <div className="panel-bottom"><span>Questions about your order?</span><a href="mailto:hello@asolevennetta.com">Write to our studio <ArrowIcon /></a></div>}
    </aside>
  </div>
}

function BagCheckoutPanel({ cart, onClose, onRemove, onOrderPlaced }) {
  const [addresses, setAddresses] = useState([])
  const [selectedAddressId, setSelectedAddressId] = useState('')
  const [busy, setBusy] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')
  const [form, setForm] = useState({
    recipientName: '',
    phoneNumber: '',
    county: '',
    town: '',
    streetAddress: '',
    isDefault: true,
  })

  useEffect(() => {
    if (!cart.length) return undefined
    const controller = new AbortController()
    fetch('/api/v1/addresses', { headers: { Authorization: `Bearer ${getAccessToken()}` }, signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return
        const data = await response.json()
        const items = Array.isArray(data.items) ? data.items : []
        setAddresses(items)
        if (items[0]) setSelectedAddressId(items[0].id)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [cart.length])

  async function placeOrder() {
    try {
      setBusy(true)
      setCheckoutError('')
      let addressId = selectedAddressId

      if (!addressId && addresses.length === 0) {
        const response = await fetch('/api/v1/addresses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken()}` },
          body: JSON.stringify(form),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error?.message ?? 'Delivery address could not be saved')
        addressId = data.item.id
        setAddresses((current) => [data.item, ...current])
        setSelectedAddressId(addressId)
      }

      if (!addressId) throw new Error('Choose or add a delivery address before placing the order')

      const response = await fetch('/api/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAccessToken()}`,
          'Idempotency-Key': `checkout-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({ addressId }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error?.message ?? 'Order could not be created')
      const orderNumber = data.item?.orderNumber ?? data.item?.id ?? 'new order'
      window.dispatchEvent(new CustomEvent('asv-toast', { detail: `Order ${orderNumber} placed. Payment is pending.` }))
      onOrderPlaced?.()
      onClose()
    } catch (error) {
      setCheckoutError(error.message)
    } finally {
      setBusy(false)
    }
  }

  if (!cart.length) {
    return <div className="panel-body"><div className="panel-empty"><BagIcon /><h3>Your bag is taking a breath.</h3><p>When a pair feels right, you will find it here.</p><button className="primary-button" onClick={onClose}>Continue exploring <ArrowIcon /></button></div></div>
  }

  return <div className="panel-body">
    {cart.map((item) => <article className="bag-item" key={item.id}><img src={item.images?.[0] || sampleProducts[0].images[0]} alt="" /><div><h3>{item.name}</h3><p>EU {item.size} · {item.color}</p><span>Qty {item.quantity}</span><b>{formatPrice(item.unitPrice)}</b><button className="remove-link" onClick={() => onRemove(item.id)}>Remove</button></div></article>)}
    <div className="bag-total">
      <span>Subtotal</span>
      <b>{formatPrice(cart.reduce((sum, item) => sum + Number(item.unitPrice) * Number(item.quantity), 0))}</b>
      <p>Delivery and final details are confirmed at checkout.</p>
      {addresses.length > 0 && <label className="owner-product-form" style={{ display: 'grid', gap: '0.6rem' }}>
        <span>Delivery address</span>
        <select value={selectedAddressId} onChange={(event) => setSelectedAddressId(event.target.value)}>
          {addresses.map((address) => <option key={address.id} value={address.id}>{address.recipientName} · {address.town}</option>)}
        </select>
      </label>}
      {addresses.length === 0 && <div className="owner-product-form" style={{ display: 'grid', gap: '0.6rem' }}>
        <label>Recipient name<input value={form.recipientName} onChange={(event) => setForm((current) => ({ ...current, recipientName: event.target.value }))} /></label>
        <label>Phone number<input value={form.phoneNumber} onChange={(event) => setForm((current) => ({ ...current, phoneNumber: event.target.value }))} /></label>
        <label>County<input value={form.county} onChange={(event) => setForm((current) => ({ ...current, county: event.target.value }))} /></label>
        <label>Town<input value={form.town} onChange={(event) => setForm((current) => ({ ...current, town: event.target.value }))} /></label>
        <label>Street address<textarea value={form.streetAddress} onChange={(event) => setForm((current) => ({ ...current, streetAddress: event.target.value }))} rows="3" /></label>
      </div>}
      {checkoutError && <p className="form-error" role="alert">{checkoutError}</p>}
      <button className="primary-button" onClick={() => void placeOrder()} disabled={busy}> {busy ? 'Placing order...' : 'Place order'} <ArrowIcon /></button>
    </div>
  </div>
}

function OwnerStudio({ token, onSignOut }) {
  const [view, setView] = useState('products')
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const loadStudio = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const headers = { Authorization: `Bearer ${token}` }
      const [productResponse, categoryResponse, orderResponse] = await Promise.all([
        fetch('/api/v1/admin/products?page=1&pageSize=100', { headers }),
        fetch('/api/v1/admin/categories', { headers }),
        fetch('/api/v1/admin/orders?page=1&pageSize=100', { headers }),
      ])
      const [productData, categoryData, orderData] = await Promise.all([productResponse.json(), categoryResponse.json(), orderResponse.json()])
      const failed = [productResponse, categoryResponse, orderResponse].find((response) => !response.ok)
      if (failed) throw new Error(productData.error?.message ?? 'Owner data could not be loaded')
      setProducts(productData.items ?? [])
      setCategories(categoryData.items ?? [])
      setOrders(orderData.items ?? [])
    } catch (exception) {
      setError(exception.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadStudio() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadStudio])

  async function createCategory(event) {
    event.preventDefault()
    const form = event.currentTarget
    setBusy(true)
    setNotice('')
    const formData = new FormData(form)
    try {
      const response = await fetch('/api/v1/admin/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: formData.get('categoryName'), description: formData.get('categoryDescription') || undefined }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Category could not be created')
      form.reset()
      setNotice('Category created')
      await loadStudio()
    } catch (exception) { setError(exception.message) } finally { setBusy(false) }
  }

  async function createProduct(event) {
    event.preventDefault()
    const form = event.currentTarget
    setBusy(true)
    setNotice('')
    const formData = new FormData(form)
    const imageUrl = String(formData.get('imageUrl') ?? '').trim()
    try {
      const response = await fetch('/api/v1/admin/products', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: formData.get('name'), brand: formData.get('brand'), categoryId: formData.get('categoryId'),
          basePrice: Number(formData.get('basePrice')), images: imageUrl ? [imageUrl] : [], status: 'active',
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Product could not be created')
      form.reset()
      setNotice('Product published')
      await loadStudio()
    } catch (exception) { setError(exception.message) } finally { setBusy(false) }
  }

  async function adjustStock(variantId, quantityDelta) {
    setNotice('')
    try {
      const response = await fetch(`/api/v1/admin/variants/${variantId}/inventory`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ quantityDelta }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Inventory could not be changed')
      setNotice('Inventory updated and recorded')
      await loadStudio()
    } catch (exception) { setError(exception.message) }
  }

  async function advanceOrder(order, status) {
    try {
      const response = await fetch(`/api/v1/admin/orders/${order.id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ status }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Order could not be updated')
      setNotice('Order updated')
      await loadStudio()
    } catch (exception) { setError(exception.message) }
  }

  return <div className="owner-studio">
    <div className="owner-toolbar"><div><span className="owner-kicker">A SOLE VENNETTA / OPERATIONS</span><p>{accountLabel(products.length, orders.length)}</p></div><button className="owner-signout" onClick={onSignOut}>Sign out</button></div>
    <div className="owner-metrics"><div><span>PRODUCTS</span><b>{products.length}</b></div><div><span>LIVE</span><b>{products.filter((product) => product.status === 'active').length}</b></div><div><span>ORDERS</span><b>{orders.length}</b></div></div>
    <div className="owner-tabs" role="tablist" aria-label="Owner studio sections"><button className={view === 'products' ? 'is-active' : ''} onClick={() => setView('products')}>Products & stock</button><button className={view === 'orders' ? 'is-active' : ''} onClick={() => setView('orders')}>Orders</button></div>
    {notice && <p className="owner-notice" role="status">{notice}</p>}{error && <p className="owner-error" role="alert">{error}</p>}
    {loading ? <p className="panel-loading">Opening the studio...</p> : view === 'products' ? <>
      <section className="owner-section"><h3>Publish a pair</h3>{!categories.length ? <p className="owner-helper">Create a category before publishing products.</p> : null}
        <form className="owner-product-form" onSubmit={createProduct}>
          <label>Product name<input name="name" required maxLength="240" /></label><div className="owner-form-row"><label>Brand<input name="brand" defaultValue="A Sole Vennetta" required /></label><label>Price (KES)<input name="basePrice" type="number" min="1" step="0.01" required /></label></div>
          <label>Category<select name="categoryId" required disabled={!categories.length}><option value="">Choose a category</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
          <label>Image URL<input name="imageUrl" type="url" placeholder="https://..." /></label>
          <button className="owner-submit" disabled={busy || !categories.length}>{busy ? 'Saving...' : 'Publish product'} <ArrowIcon /></button>
        </form>
      </section>
      <section className="owner-section"><h3>Categories</h3><div className="owner-category-list">{categories.map((category) => <span key={category.id}>{category.name}</span>)}</div>
        <form className="owner-category-form" onSubmit={createCategory}><label className="visually-hidden" htmlFor="owner-category-name">New category</label><input id="owner-category-name" name="categoryName" placeholder="New category name" required maxLength="120" /><button aria-label="Add category" disabled={busy}><PlusIcon /></button></form>
      </section>
      <section className="owner-section"><h3>Collection <span>{products.length}</span></h3>{products.length ? products.map((product) => <article className="owner-product-row" key={product.id}><div><strong>{product.name}</strong><span>{product.status} · {formatPrice(product.discountPrice || product.basePrice)}</span>{product.variants?.map((variant) => <small key={variant.id}>{variant.sku} / EU {variant.size} / {variant.color} / {variant.stockQuantity} in stock</small>)}</div><div className="owner-row-actions">{product.status !== 'active' && <button onClick={async () => { const response = await fetch(`/api/v1/admin/products/${product.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ status: 'active' }) }); if (response.ok) await loadStudio(); else setError('Product could not be published') }}>Publish</button>}{product.variants?.map((variant) => <button key={variant.id} onClick={() => void adjustStock(variant.id, 1)} aria-label={`Add one stock for ${variant.sku}`} title={`Add stock to ${variant.sku}`}>+1</button>)}</div></article>) : <p className="owner-helper">The collection is empty.</p>}</section>
    </> : <section className="owner-section owner-orders"><h3>Incoming orders</h3>{orders.length ? orders.map((order) => <article className="owner-order-row" key={order.id}><div><strong>{order.orderNumber}</strong><span>{order.status?.replaceAll('_', ' ')} · {formatPrice(order.totalAmount)}</span></div><OrderAction order={order} onAdvance={advanceOrder} /></article>) : <p className="owner-helper">No orders yet.</p>}</section>}
  </div>
}

function accountLabel(productCount, orderCount) {
  return `${productCount} products · ${orderCount} orders`
}

function OrderAction({ order, onAdvance }) {
  const nextStatus = { confirmed: 'processing', processing: 'shipped', shipped: 'delivered' }[order.status]
  if (nextStatus) return <button className="owner-order-action" onClick={() => onAdvance(order, nextStatus)}>{nextStatus} <ArrowIcon /></button>
  if (['pending_payment', 'pending_sync'].includes(order.status)) return <span className="owner-pending">{order.status === 'pending_sync' ? 'Sync pending' : 'Awaiting payment'}</span>
  return <span className="owner-pending">{order.status}</span>
}

function AuthDialog({ mode, busy, error, onModeChange, onClose, onSubmit, onSocialAuth }) {
  const [googleReady, setGoogleReady] = useState(false)
  const [appleReady, setAppleReady] = useState(false)
  const [providerError, setProviderError] = useState('')
  const onSocialAuthRef = useRef(onSocialAuth)

  useEffect(() => { onSocialAuthRef.current = onSocialAuth }, [onSocialAuth])

  useEffect(() => {
    let active = true
    if (googleClientId) {
      const script = document.querySelector('#google-identity-script') ?? document.createElement('script')
      script.id = 'google-identity-script'
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.onload = () => {
        if (!active || !window.google?.accounts?.id) return
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: ({ credential }) => {
            if (credential) void onSocialAuthRef.current('google', credential)
          },
        })
        setGoogleReady(true)
      }
      if (!script.isConnected) document.head.appendChild(script)
      else if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: ({ credential }) => {
            if (credential) void onSocialAuthRef.current('google', credential)
          },
        })
        requestAnimationFrame(() => { if (active) setGoogleReady(true) })
      }
    }

    if (appleClientId) {
      const script = document.querySelector('#apple-identity-script') ?? document.createElement('script')
      script.id = 'apple-identity-script'
      script.src = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js'
      script.async = true
      script.onload = () => {
        if (!active || !window.AppleID?.auth) return
        window.AppleID.auth.init({ clientId: appleClientId, scope: 'name email', redirectURI: appleRedirectUri, usePopup: true })
        setAppleReady(true)
      }
      if (!script.isConnected) document.head.appendChild(script)
      else if (window.AppleID?.auth) {
        window.AppleID.auth.init({ clientId: appleClientId, scope: 'name email', redirectURI: appleRedirectUri, usePopup: true })
        requestAnimationFrame(() => { if (active) setAppleReady(true) })
      }
    }

    return () => { active = false }
  }, [])

  async function continueWithApple() {
    setProviderError('')
    try {
      const result = await window.AppleID.auth.signIn()
      const credential = result?.authorization?.id_token
      if (!credential) throw new Error('Apple did not return an identity token')
      await onSocialAuthRef.current('apple', credential)
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
      {!googleClientId || !appleClientId ? <p className="provider-setup-note">Social sign-in becomes available when its provider is configured.</p> : null}
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

function SunIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.6" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></svg> }
function MoonIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 15.4A8.8 8.8 0 0 1 8.6 3.5 8.8 8.8 0 1 0 20.5 15.4Z" /></svg> }
function UserIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M4.8 20c.5-3.1 3.3-5.2 7.2-5.2s6.7 2.1 7.2 5.2" /></svg> }
function BagIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l1 13H4L5 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></svg> }
function MenuIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h16M4 16h16" /></svg> }
function ArrowIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" /></svg> }
function ArrowDownIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v15m-6-6 6 6 6-6" /></svg> }
function SearchIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.6" /><path d="m16 16 4 4" /></svg> }
function PlusIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg> }
function CloseIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg> }
function ChevronLeftIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5-7 7 7 7" /></svg> }
function ChevronRightIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 5 7 7-7 7" /></svg> }
function GoogleIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285f4" d="M21.6 12.23c0-.72-.06-1.42-.18-2.1H12v3.97h5.39a4.62 4.62 0 0 1-2 3.03v2.48h3.23c1.9-1.75 2.98-4.33 2.98-7.38Z" /><path fill="#34a853" d="M12 22c2.7 0 4.96-.9 6.62-2.39l-3.23-2.48c-.9.6-2.05.96-3.39.96-2.6 0-4.8-1.76-5.59-4.13H3.08v2.56A10 10 0 0 0 12 22Z" /><path fill="#fbbc05" d="M6.41 13.96A6.02 6.02 0 0 1 6.1 12c0-.68.11-1.34.31-1.96V7.48H3.08A10 10 0 0 0 2 12c0 1.62.39 3.15 1.08 4.52l3.33-2.56Z" /><path fill="#ea4335" d="M12 5.91c1.47 0 2.79.51 3.83 1.51l2.87-2.87C16.95 2.98 14.7 2 12 2a10 10 0 0 0-8.92 5.48l3.33 2.56C7.2 7.67 9.4 5.91 12 5.91Z" /></svg> }
function AppleIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.05 12.54c.02 2.16 1.9 2.88 1.92 2.89-.02.05-.3 1.04-.98 2.06-.59.88-1.2 1.75-2.16 1.77-.94.02-1.25-.57-2.34-.57s-1.43.55-2.32.59c-.93.04-1.64-.95-2.24-1.83-1.22-1.77-2.15-5.01-.9-7.2.62-1.09 1.74-1.78 2.95-1.8.92-.02 1.78.62 2.34.62.56 0 1.61-.77 2.72-.66.47.02 1.8.19 2.65 1.44-.07.04-1.58.93-1.64 2.69ZM15.28 6.72c.5-.61.84-1.45.75-2.29-.73.03-1.61.49-2.13 1.1-.47.55-.88 1.41-.77 2.23.81.06 1.65-.41 2.15-1.04Z" /></svg> }
function PackageIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4.5 7.5 7.5 4 7.5-4M12 12v8" /></svg> }
