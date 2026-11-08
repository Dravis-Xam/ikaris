export default function SiteFooter({ onOwnerPortal }) {
  return <footer className="site-footer"><a className="footer-wordmark" href="#top">A SOLE VENNETTA <small>SNEAKERS ✦ STYLE ✦ EVERY STEP</small></a><span>Designed for your every day.</span><div className="footer-actions"><a href="#collection">The collection</a><button onClick={onOwnerPortal}>Owner portal</button><span>© ASV 2026</span></div></footer>
}
