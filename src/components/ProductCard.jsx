import { useState } from 'react'
import { formatPrice, sampleProducts } from '../data/storefront.js'
import { PlusIcon } from './icons.jsx'

export default function ProductCard({ product, index, preview, onAdd }) {
  const availableVariants = (product.variants ?? []).filter((variant) => Number(variant.stockQuantity) > 0)
  const [variantId, setVariantId] = useState(availableVariants[0]?.id ?? '')
  const activeVariant = availableVariants.find((variant) => variant.id === variantId)
  const image = Array.isArray(product.images) ? product.images[0] : product.images?.[0]
  const price = product.discountPrice || product.basePrice

  return <article className="product-card" style={{ '--card-index': index }}>
    <div className="product-image-wrap">
      <img src={image || sampleProducts[index % sampleProducts.length].images[0]} alt={`${product.name} sneaker`} loading="lazy" />
      {product.discountPrice && <span className="product-badge">A considered price</span>}
      <button className="product-quick-add" onClick={() => onAdd(product, activeVariant)} disabled={preview || !activeVariant} aria-label={`Add ${product.name} to bag`} title={preview ? 'Preview only' : activeVariant ? 'Add to bag' : 'Currently unavailable'}><PlusIcon /></button>
    </div>
    <div className="product-info">
      <div className="product-title-line"><h3>{product.name}</h3><span>{formatPrice(price)}</span></div>
      <div className="product-meta">
        <span>{activeVariant ? activeVariant.color : product.note ?? 'Thoughtfully considered'}</span>
        {availableVariants.length > 0 && <label><span className="visually-hidden">Choose size</span><select value={variantId} onChange={(event) => setVariantId(event.target.value)} aria-label={`Size for ${product.name}`}>{availableVariants.map((variant) => <option value={variant.id} key={variant.id}>EU {variant.size}</option>)}</select></label>}
      </div>
      {preview && <span className="preview-stock">Preview collection</span>}
      {!preview && !availableVariants.length && <span className="preview-stock">Currently unavailable</span>}
    </div>
  </article>
}
