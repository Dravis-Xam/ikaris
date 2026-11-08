import { useEffect, useState } from 'react'
import BagCheckoutPanel from './BagCheckoutPanel.jsx'
import OwnerStudio from './OwnerStudio.jsx'
import { formatPrice, getAccessToken } from '../data/storefront.js'
import { ArrowIcon, BagIcon, CloseIcon, PackageIcon } from './icons.jsx'

export default function SidePanel({ type, account, cart, onClose, onRemove, onSignOut, onOrderPlaced }) {
  const isOrders = type === 'orders'
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(isOrders)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOrders || account?.type !== 'customer') return undefined
    const controller = new AbortController()
    fetch('/api/v1/orders?page=1&pageSize=20', { headers: { Authorization: `Bearer ${getAccessToken()}` }, signal: controller.signal })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error?.message ?? 'Orders are unavailable')
        setOrders(data.items ?? [])
      })
      .catch((exception) => { if (exception.name !== 'AbortError') setError(exception.message) })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [account, isOrders])

  return <div className="panel-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <aside className="side-panel" aria-label={isOrders ? 'Your orders' : type === 'account' ? 'Your account' : 'Shopping bag'}>
      <div className="panel-heading"><div><p className="eyebrow"><span /> {isOrders ? 'Your history' : type === 'account' ? 'Your ASV' : type === 'owner' ? 'Private access' : 'Your selection'}</p><h2>{isOrders ? 'Orders' : type === 'account' ? 'Account' : type === 'owner' ? 'Owner studio' : 'The bag'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close panel"><CloseIcon /></button></div>
      {type === 'bag' && <BagCheckoutPanel cart={cart} onClose={onClose} onRemove={onRemove} onOrderPlaced={onOrderPlaced} />}
      {type === 'account' && <AccountPanel account={account} onSignOut={onSignOut} />}
      {isOrders && <OrdersPanel orders={orders} loading={loading} error={error} />}
      {type === 'owner' && <OwnerStudio token={getAccessToken()} onSignOut={onSignOut} />}
      {type !== 'owner' && <div className="panel-bottom"><span>Questions about your order?</span><a href="mailto:hello@asolevennetta.com">Write to our studio <ArrowIcon /></a></div>}
    </aside>
  </div>
}

function AccountPanel({ account, onSignOut }) {
  return <div className="account-panel">
    <div className="account-greeting"><span className="account-avatar">{(account?.firstName ?? account?.fullName ?? 'A').slice(0, 1)}</span><div><h3>{account?.firstName ? `Welcome, ${account.firstName}` : account?.fullName ?? 'Welcome back'}</h3><p>{account?.email}</p></div></div>
    {account?.type === 'admin' ? <button className="account-menu-row" onClick={() => window.dispatchEvent(new CustomEvent('asv-open-owner'))}>Owner studio <ArrowIcon /></button> : <button className="account-menu-row" onClick={() => window.dispatchEvent(new CustomEvent('asv-open-orders'))}>Order history <ArrowIcon /></button>}
    <button className="account-menu-row" onClick={onSignOut}>Sign out <ArrowIcon /></button>
  </div>
}

function OrdersPanel({ orders, loading, error }) {
  return <div className="panel-body">
    {loading ? <p className="panel-loading">Gathering your order notes...</p> : error ? <div className="panel-empty"><p>{error}</p></div> : !orders.length ? <div className="panel-empty"><PackageIcon /><h3>Nothing on its way just yet.</h3><p>Your next favorite pair is waiting in the collection.</p></div> : orders.map((order) => <article className="order-row" key={order.id}><div><span>{order.orderNumber}</span><small>{new Date(order.createdAt).toLocaleDateString()}</small></div><b>{formatPrice(order.totalAmount)}</b><em>{order.status?.replaceAll('_', ' ')}</em></article>)}
  </div>
}
