import useOwnerStudio from '../hooks/useOwnerStudio.js'
import { formatPrice } from '../data/storefront.js'
import { ArrowIcon, PlusIcon } from './icons.jsx'

export default function OwnerStudio({ token, onSignOut }) {
  const studio = useOwnerStudio(token)
  const { view, setView, products, categories, orders, loading, error, notice, busy, setError, createCategory, createProduct, adjustStock, publishProduct, advanceOrder } = studio

  return <div className="owner-studio">
    <div className="owner-toolbar"><div><span className="owner-kicker">A SOLE VENNETTA / OPERATIONS</span><p>{products.length} products · {orders.length} orders</p></div><button className="owner-signout" onClick={onSignOut}>Sign out</button></div>
    <div className="owner-metrics"><div><span>PRODUCTS</span><b>{products.length}</b></div><div><span>LIVE</span><b>{products.filter((product) => product.status === 'active').length}</b></div><div><span>ORDERS</span><b>{orders.length}</b></div></div>
    <div className="owner-tabs" role="tablist" aria-label="Owner studio sections"><button className={view === 'products' ? 'is-active' : ''} onClick={() => setView('products')}>Products & stock</button><button className={view === 'orders' ? 'is-active' : ''} onClick={() => setView('orders')}>Orders</button></div>
    {notice && <p className="owner-notice" role="status">{notice}</p>}{error && <p className="owner-error" role="alert">{error}</p>}
    {loading ? <p className="panel-loading">Opening the studio...</p> : view === 'products' ? <OwnerProducts products={products} categories={categories} busy={busy} onError={setError} onCreateCategory={createCategory} onCreateProduct={createProduct} onAdjustStock={adjustStock} onPublish={publishProduct} /> : <OwnerOrders orders={orders} onAdvance={advanceOrder} />}
  </div>
}

function OwnerProducts({ products, categories, busy, onError, onCreateCategory, onCreateProduct, onAdjustStock, onPublish }) {
  return <>
    <section className="owner-section"><h3>Publish a pair</h3>{!categories.length && <p className="owner-helper">Create a category before publishing products.</p>}
      <form className="owner-product-form" onSubmit={onCreateProduct}>
        <label>Product name<input name="name" required maxLength="240" /></label>
        <div className="owner-form-row"><label>Brand<input name="brand" defaultValue="A Sole Vennetta" required /></label><label>Price (KES)<input name="basePrice" type="number" min="1" step="0.01" required /></label></div>
        <label>Category<select name="categoryId" required disabled={!categories.length}><option value="">Choose a category</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
        <label>Image URL<input name="imageUrl" type="url" placeholder="https://..." /></label>
        <button className="owner-submit" disabled={busy || !categories.length}>{busy ? 'Saving...' : 'Publish product'} <ArrowIcon /></button>
      </form>
    </section>
    <section className="owner-section"><h3>Categories</h3><div className="owner-category-list">{categories.map((category) => <span key={category.id}>{category.name}</span>)}</div>
      <form className="owner-category-form" onSubmit={onCreateCategory}><label className="visually-hidden" htmlFor="owner-category-name">New category</label><input id="owner-category-name" name="categoryName" placeholder="New category name" required maxLength="120" /><button aria-label="Add category" disabled={busy}><PlusIcon /></button></form>
    </section>
    <section className="owner-section"><h3>Collection <span>{products.length}</span></h3>{products.length ? products.map((product) => <OwnerProductRow key={product.id} product={product} onError={onError} onAdjustStock={onAdjustStock} onPublish={onPublish} />) : <p className="owner-helper">The collection is empty.</p>}</section>
  </>
}

function OwnerProductRow({ product, onError, onAdjustStock, onPublish }) {
  return <article className="owner-product-row"><div><strong>{product.name}</strong><span>{product.status} · {formatPrice(product.discountPrice || product.basePrice)}</span>{product.variants?.map((variant) => <small key={variant.id}>{variant.sku} / EU {variant.size} / {variant.color} / {variant.stockQuantity} in stock</small>)}</div>
    <div className="owner-row-actions">{product.status !== 'active' && <button onClick={async () => { try { await onPublish(product.id) } catch (exception) { onError(exception.message) } }}>Publish</button>}{product.variants?.map((variant) => <button key={variant.id} onClick={() => void onAdjustStock(variant.id, 1)} aria-label={`Add one stock for ${variant.sku}`} title={`Add stock to ${variant.sku}`}>+1</button>)}</div>
  </article>
}

function OwnerOrders({ orders, onAdvance }) {
  return <section className="owner-section owner-orders"><h3>Incoming orders</h3>{orders.length ? orders.map((order) => <article className="owner-order-row" key={order.id}><div><strong>{order.orderNumber}</strong><span>{order.status?.replaceAll('_', ' ')} · {formatPrice(order.totalAmount)}</span></div><OrderAction order={order} onAdvance={onAdvance} /></article>) : <p className="owner-helper">No orders yet.</p>}</section>
}

function OrderAction({ order, onAdvance }) {
  const nextStatus = { confirmed: 'processing', processing: 'shipped', shipped: 'delivered' }[order.status]
  if (nextStatus) return <button className="owner-order-action" onClick={() => onAdvance(order, nextStatus)}>{nextStatus} <ArrowIcon /></button>
  if (['pending_payment', 'pending_sync'].includes(order.status)) return <span className="owner-pending">{order.status === 'pending_sync' ? 'Sync pending' : 'Awaiting payment'}</span>
  return <span className="owner-pending">{order.status}</span>
}
