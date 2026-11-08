export const sampleProducts = [
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

export function formatPrice(value) {
  const number = Number(value)
  return Number.isFinite(number)
    ? new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(number)
    : value
}

export function getAccessToken() {
  return window.localStorage.getItem('asv.accessToken')
}
