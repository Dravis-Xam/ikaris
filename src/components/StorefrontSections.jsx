import ProductCard from './ProductCard.jsx'
import { ArrowDownIcon, ArrowIcon, SearchIcon } from './icons.jsx'

export function HeroSection({ onHeroImageReady }) {
  return <section className="hero-section" aria-labelledby="hero-title">
    <div className="hero-copy"><p className="eyebrow"><span /> Designed to move with you</p><h1 id="hero-title">A quieter kind<br />of <em>statement.</em></h1><p className="hero-description">Considered sneakers for wherever the day takes you. Made to feel like yours, from the very first step.</p><a className="primary-button" href="#collection">Discover the collection <ArrowIcon /></a><div className="hero-proof"><span className="proof-line" /><span>Independent spirit. Intentional design.</span></div></div>
    <div className="hero-visual"><div className="hero-index"><span>01</span><i /> BLACK / WHITE / EVERYDAY</div><div className="shoe-showcase shoe-showcase--image"><img className="shoe-showcase__image" src="/images/WhatsApp_Image_2026-11-07_at_15.11.08-removebg-preview.png" alt="Black and white Nike sneakers" fetchPriority="high" decoding="async" onLoad={onHeroImageReady} onError={onHeroImageReady} /></div><span className="hero-side-note">FORM FOLLOWS FEELING / 2026</span><div className="hero-caption"><span>BLACK / WHITE RUNNER</span><b>01 / 04</b></div></div>
    <div className="hero-bottomline"><span>Made for the in-between moments.</span><a href="#collection">Scroll to explore <ArrowDownIcon /></a><span>01 — 04</span></div>
  </section>
}

export function CollectionSection({ catalogMode, categories, activeCategory, onCategoryChange, search, onSearchChange, products, onAdd }) {
  const visibleProducts = products.filter((product) => {
    const query = search.trim().toLowerCase()
    const matchesText = !query || `${product.name} ${product.brand} ${product.categoryName ?? ''}`.toLowerCase().includes(query)
    return matchesText && (activeCategory === 'All pairs' || product.categoryName === activeCategory)
  })

  return <section className="collection-section" id="collection" aria-labelledby="collection-title">
    <div className="section-heading"><div><p className="eyebrow"><span /> A study in everyday</p><h2 id="collection-title">The collection</h2></div><p>Four silhouettes. A hundred ways to make them yours.</p></div>
    {catalogMode === 'preview' && <p className="catalog-note" role="status">A considered preview of the collection. Live product availability appears when the shop catalog is connected.</p>}
    <div className="collection-tools"><div className="category-tabs" role="tablist" aria-label="Filter collection">{categories.map((category) => <button key={category} className={activeCategory === category ? 'category-tab is-active' : 'category-tab'} onClick={() => onCategoryChange(category)} role="tab" aria-selected={activeCategory === category}>{category}</button>)}</div><label className="search-control"><SearchIcon /><span className="visually-hidden">Search shoes</span><input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Find your pair" /></label></div>
    <div className="product-grid">{visibleProducts.map((product, index) => <ProductCard key={product.id} product={product} index={index} preview={catalogMode !== 'live'} onAdd={onAdd} />)}{!visibleProducts.length && <div className="empty-search"><SearchIcon /><p>No pairs found. Try another search.</p></div>}</div>
    <a className="text-link collection-more" href="#atelier">A little more about us <ArrowIcon /></a>
  </section>
}

export function AtelierSection() {
  return <section className="atelier-section" id="atelier"><div className="atelier-image" role="img" aria-label="A sculptural sneaker in a quiet studio setting" /><div className="atelier-copy"><p className="eyebrow"><span /> Our point of view</p><h2>Less noise.<br /><em>More feeling.</em></h2><p>We believe the right shoe doesn't ask for attention. It earns a place in your everyday: thoughtful materials, familiar comfort, and the kind of detail you notice over time.</p><a className="text-link" href="#service">The ASV standard <ArrowIcon /></a><span className="atelier-index">ASV / NOTES ON MOVEMENT / 001</span></div></section>
}

export function ServiceSection() {
  return <section className="service-section" id="service"><p className="eyebrow"><span /> The ASV standard</p><div className="service-grid"><article><span>01</span><h3>Considered by design</h3><p>Clean lines, balanced proportions, nothing that doesn't belong.</p></article><article><span>02</span><h3>Comfort that stays</h3><p>Everyday cushioning and materials chosen to move with you.</p></article><article><span>03</span><h3>Here for the long walk</h3><p>Timeless forms, made for repeat wear and the miles in between.</p></article></div></section>
}
