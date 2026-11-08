import { useEffect, useState } from 'react'
import { formatPrice, getAccessToken, sampleProducts } from '../data/storefront.js'
import { ArrowIcon, BagIcon } from './icons.jsx'

export default function BagCheckoutPanel({ cart, onClose, onRemove, onOrderPlaced }) {
  const [addresses, setAddresses] = useState([])
  const [selectedAddressId, setSelectedAddressId] = useState('')
  const [busy, setBusy] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')
  const [form, setForm] = useState({ recipientName: '', phoneNumber: '', county: '', town: '', streetAddress: '', isDefault: true })

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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken()}`, 'Idempotency-Key': `checkout-${crypto.randomUUID()}` },
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

  if (!cart.length) return <div className="panel-body"><div className="panel-empty"><BagIcon /><h3>Your bag is taking a breath.</h3><p>When a pair feels right, you will find it here.</p><button className="primary-button" onClick={onClose}>Continue exploring <ArrowIcon /></button></div></div>

  return <div className="panel-body">
    {cart.map((item) => <article className="bag-item" key={item.id}><img src={item.images?.[0] || sampleProducts[0].images[0]} alt="" /><div><h3>{item.name}</h3><p>EU {item.size} · {item.color}</p><span>Qty {item.quantity}</span><b>{formatPrice(item.unitPrice)}</b><button className="remove-link" onClick={() => onRemove(item.id)}>Remove</button></div></article>)}
    <div className="bag-total">
      <span>Subtotal</span>
      <b>{formatPrice(cart.reduce((sum, item) => sum + Number(item.unitPrice) * Number(item.quantity), 0))}</b>
      <p>Delivery and final details are confirmed at checkout.</p>
      {addresses.length > 0 && <label className="owner-product-form" style={{ display: 'grid', gap: '0.6rem' }}><span>Delivery address</span><select value={selectedAddressId} onChange={(event) => setSelectedAddressId(event.target.value)}>{addresses.map((address) => <option key={address.id} value={address.id}>{address.recipientName} · {address.town}</option>)}</select></label>}
      {addresses.length === 0 && <div className="owner-product-form" style={{ display: 'grid', gap: '0.6rem' }}>
        <label>Recipient name<input value={form.recipientName} onChange={(event) => setForm((current) => ({ ...current, recipientName: event.target.value }))} /></label>
        <label>Phone number<input value={form.phoneNumber} onChange={(event) => setForm((current) => ({ ...current, phoneNumber: event.target.value }))} /></label>
        <label>County<input value={form.county} onChange={(event) => setForm((current) => ({ ...current, county: event.target.value }))} /></label>
        <label>Town<input value={form.town} onChange={(event) => setForm((current) => ({ ...current, town: event.target.value }))} /></label>
        <label>Street address<textarea value={form.streetAddress} onChange={(event) => setForm((current) => ({ ...current, streetAddress: event.target.value }))} rows="3" /></label>
      </div>}
      {checkoutError && <p className="form-error" role="alert">{checkoutError}</p>}
      <button className="primary-button" onClick={() => void placeOrder()} disabled={busy}>{busy ? 'Placing order...' : 'Place order'} <ArrowIcon /></button>
    </div>
  </div>
}
