import { BagIcon, MenuIcon, MoonIcon, SunIcon, UserIcon } from './icons.jsx'

export default function SiteHeader({ theme, setTheme, account, setDrawer, cartCount, openAuth }) {
  return <>
    <div className="announcement-bar">
      <span>Complimentary delivery on orders over KSh 20,000</span>
      <span className="service-indicator"><i /> Maison preview</span>
    </div>
    <header className="site-header">
      <a className="wordmark" href="#top" aria-label="A Sole Vennetta home"><span>A SOLE VENNETTA</span><small>SNEAKERS <b>✦</b> STYLE <b>✦</b> EVERY STEP</small></a>
      <nav className="main-nav" id="main-navigation" aria-label="Main navigation"><a href="#collection">The collection</a><a href="#atelier">Our point of view</a><a href="#service">The ASV standard</a></nav>
      <div className="header-actions">
        <button className="icon-button theme-toggle" onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}>{theme === 'light' ? <SunIcon /> : <MoonIcon />}</button>
        {account ? <button className="account-action" onClick={() => setDrawer('account')} aria-label="Open your account"><UserIcon /><span>{account.firstName ?? 'Account'}</span></button> : <button className="icon-button" onClick={openAuth} aria-label="Sign in" title="Sign in"><UserIcon /></button>}
        <button className="bag-action" onClick={() => setDrawer('bag')} aria-label={`Shopping bag, ${cartCount} items`}><BagIcon /><span>Bag</span><b>{String(cartCount).padStart(2, '0')}</b></button>
        <button className="mobile-menu" onClick={() => document.querySelector('.main-nav')?.classList.toggle('main-nav--open')} aria-label="Open navigation" aria-controls="main-navigation"><MenuIcon /></button>
      </div>
    </header>
  </>
}
