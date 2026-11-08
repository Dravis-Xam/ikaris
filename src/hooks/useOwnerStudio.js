import { useCallback, useEffect, useState } from 'react'

export default function useOwnerStudio(token) {
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
      const responses = await Promise.all([
        fetch('/api/v1/admin/products?page=1&pageSize=100', { headers }),
        fetch('/api/v1/admin/categories', { headers }),
        fetch('/api/v1/admin/orders?page=1&pageSize=100', { headers }),
      ])
      const data = await Promise.all(responses.map((response) => response.json()))
      const failedIndex = responses.findIndex((response) => !response.ok)
      if (failedIndex !== -1) throw new Error(data[failedIndex].error?.message ?? 'Owner data could not be loaded')
      setProducts(data[0].items ?? [])
      setCategories(data[1].items ?? [])
      setOrders(data[2].items ?? [])
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
      const response = await fetch('/api/v1/admin/categories', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: formData.get('categoryName'), description: formData.get('categoryDescription') || undefined }) })
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
      const response = await fetch('/api/v1/admin/products', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: formData.get('name'), brand: formData.get('brand'), categoryId: formData.get('categoryId'), basePrice: Number(formData.get('basePrice')), images: imageUrl ? [imageUrl] : [], status: 'active' }) })
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
      const response = await fetch(`/api/v1/admin/variants/${variantId}/inventory`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ quantityDelta }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Inventory could not be changed')
      setNotice('Inventory updated and recorded')
      await loadStudio()
    } catch (exception) { setError(exception.message) }
  }

  async function publishProduct(productId) {
    const response = await fetch(`/api/v1/admin/products/${productId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ status: 'active' }) })
    if (response.ok) await loadStudio()
    else setError('Product could not be published')
  }

  async function advanceOrder(order, status) {
    try {
      const response = await fetch(`/api/v1/admin/orders/${order.id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ status }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Order could not be updated')
      setNotice('Order updated')
      await loadStudio()
    } catch (exception) { setError(exception.message) }
  }

  return { view, setView, products, categories, orders, loading, error, notice, busy, setError, createCategory, createProduct, adjustStock, publishProduct, advanceOrder }
}
