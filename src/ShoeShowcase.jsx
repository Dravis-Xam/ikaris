import { useEffect, useRef, useState } from 'react'

const fallbackImage = '/images/vennetta-runner.jpg'

function createShoe(THREE) {
  const shoe = new THREE.Group()
  const sections = [
    [-1.34, 0.48, 0.38, 0.2], [-1.14, 0.51, 0.45, 0.29], [-0.88, 0.47, 0.4, 0.34],
    [-0.58, 0.42, 0.37, 0.35], [-0.25, 0.39, 0.37, 0.35], [0.12, 0.36, 0.34, 0.34],
    [0.48, 0.28, 0.19, 0.32], [0.82, 0.22, 0.14, 0.28], [1.08, 0.17, 0.11, 0.22],
    [1.29, 0.13, 0.08, 0.11], [1.36, 0.12, 0.04, 0.04],
  ]
  const radialSegments = 24
  const positions = []
  const indices = []

  sections.forEach(([x, centerY, radiusY, radiusZ]) => {
    for (let segment = 0; segment <= radialSegments; segment += 1) {
      const angle = (segment / radialSegments) * Math.PI * 2
      positions.push(x, centerY + Math.sin(angle) * radiusY, Math.cos(angle) * radiusZ)
    }
  })

  for (let section = 0; section < sections.length - 1; section += 1) {
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const a = section * (radialSegments + 1) + segment
      const b = a + radialSegments + 1
      indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }

  const upperGeometry = new THREE.BufferGeometry()
  upperGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  upperGeometry.setIndex(indices)
  upperGeometry.computeVertexNormals()

  const upper = new THREE.Mesh(upperGeometry, new THREE.MeshStandardMaterial({
    color: '#f5eee7', roughness: 0.72, metalness: 0.02, side: THREE.DoubleSide,
  }))
  upper.castShadow = true
  upper.receiveShadow = true
  shoe.add(upper)

  const soleShape = new THREE.Shape()
  soleShape.moveTo(-1.53, 0.09)
  soleShape.quadraticCurveTo(-1.59, 0.04, -1.48, 0.01)
  soleShape.lineTo(1.13, 0.01)
  soleShape.quadraticCurveTo(1.43, 0.03, 1.5, 0.13)
  soleShape.quadraticCurveTo(1.51, 0.2, 1.39, 0.21)
  soleShape.quadraticCurveTo(0.65, 0.17, 0.05, 0.22)
  soleShape.quadraticCurveTo(-0.75, 0.27, -1.13, 0.25)
  soleShape.quadraticCurveTo(-1.44, 0.22, -1.53, 0.09)
  const soleGeometry = new THREE.ExtrudeGeometry(soleShape, { depth: 0.72, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.035, bevelThickness: 0.025 })
  soleGeometry.translate(0, 0, -0.36)
  const sole = new THREE.Mesh(soleGeometry, new THREE.MeshStandardMaterial({ color: '#d8b996', roughness: 0.52 }))
  sole.castShadow = true
  sole.receiveShadow = true
  shoe.add(sole)

  const panelMaterial = new THREE.MeshStandardMaterial({ color: '#d9aeb0', roughness: 0.77, side: THREE.DoubleSide })
  const panelCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.96, 0.66, 0.275), new THREE.Vector3(-0.68, 0.58, 0.33),
    new THREE.Vector3(-0.28, 0.45, 0.35), new THREE.Vector3(0.1, 0.41, 0.34),
    new THREE.Vector3(0.47, 0.36, 0.31), new THREE.Vector3(0.8, 0.29, 0.25),
  ])
  const panel = new THREE.Mesh(new THREE.TubeGeometry(panelCurve, 36, 0.026, 8, false), panelMaterial)
  panel.castShadow = true
  shoe.add(panel)

  const toeSeam = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.7, 0.42, 0.27), new THREE.Vector3(0.91, 0.35, 0.26),
    new THREE.Vector3(1.11, 0.28, 0.2), new THREE.Vector3(1.24, 0.25, 0.11),
  ])
  shoe.add(new THREE.Mesh(
    new THREE.TubeGeometry(toeSeam, 24, 0.009, 5, false),
    new THREE.MeshStandardMaterial({ color: '#b89478', roughness: 0.8 }),
  ))

  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(0.18, 0.045, 10, 28),
    new THREE.MeshStandardMaterial({ color: '#e8d8c8', roughness: 0.84 }),
  )
  collar.position.set(-1.05, 0.84, 0)
  collar.rotation.y = Math.PI / 2
  shoe.add(collar)

  const tongue = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.1, 0.31),
    new THREE.MeshStandardMaterial({ color: '#ead9c9', roughness: 0.84 }),
  )
  tongue.position.set(-0.02, 0.76, 0)
  tongue.rotation.z = -0.2
  shoe.add(tongue)

  const laceMaterial = new THREE.MeshStandardMaterial({ color: '#fbf7f1', roughness: 0.67 })
  for (let row = 0; row < 5; row += 1) {
    const x = -0.55 + row * 0.18
    const y = 0.86 - row * 0.025
    const laceCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x - 0.075, y, -0.145),
      new THREE.Vector3(x, y + 0.025, 0),
      new THREE.Vector3(x + 0.075, y, 0.145),
    ])
    shoe.add(new THREE.Mesh(new THREE.TubeGeometry(laceCurve, 10, 0.019, 6, false), laceMaterial))
  }

  const eyeletMaterial = new THREE.MeshStandardMaterial({ color: '#b18a67', metalness: 0.55, roughness: 0.32 })
  for (let row = 0; row < 4; row += 1) {
    const x = -0.59 + row * 0.18
    const y = 0.7 - row * 0.025
    for (const z of [-0.19, 0.19]) {
      const eyelet = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 6, 14), eyeletMaterial)
      eyelet.position.set(x, y, z)
      eyelet.rotation.x = Math.PI / 2
      shoe.add(eyelet)
    }
  }

  shoe.rotation.y = -0.36
  shoe.rotation.z = 0.025
  return shoe
}

export default function ShoeShowcase() {
  const hostRef = useRef(null)
  const [visible, setVisible] = useState(false)
  const [fallback, setFallback] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    if (!host || !('IntersectionObserver' in window)) {
      setVisible(true)
      return undefined
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true)
        observer.disconnect()
      }
    }, { rootMargin: '160px' })
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!visible || !host || fallback) return undefined

    let disposed = false
    let cleanup = () => {}

    import('three').then((THREE) => {
      if (disposed) return
    let renderer
    let animationFrame
    let resizeObserver
    let dragging = false
    let hasRendered = false
    let previousX = 0
    let previousY = 0
    let targetRotation = -0.36
    let targetTilt = 0.025

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6))
      renderer.setSize(host.clientWidth, host.clientHeight)
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFShadowMap
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.05
      renderer.domElement.setAttribute('aria-label', 'Interactive 3D sneaker. Drag to rotate.')
      renderer.domElement.setAttribute('role', 'img')
      host.appendChild(renderer.domElement)

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(33, host.clientWidth / host.clientHeight, 0.1, 50)
      camera.position.set(2.85, 2.25, 4.05)
      camera.lookAt(0, 0.5, 0)

      scene.add(new THREE.HemisphereLight('#fffaf5', '#94867c', 2.15))
      const keyLight = new THREE.DirectionalLight('#fff6ec', 3.5)
      keyLight.position.set(-2.2, 5, 4)
      keyLight.castShadow = true
      keyLight.shadow.mapSize.set(1024, 1024)
      keyLight.shadow.camera.left = -4
      keyLight.shadow.camera.right = 4
      keyLight.shadow.camera.top = 4
      keyLight.shadow.camera.bottom = -4
      keyLight.shadow.bias = -0.0004
      scene.add(keyLight)
      const rimLight = new THREE.DirectionalLight('#d9b58d', 1.2)
      rimLight.position.set(3, 2.2, -3)
      scene.add(rimLight)

      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(200, 200),
        new THREE.ShadowMaterial({ opacity: 0.16 }),
      )
      floor.rotation.x = -Math.PI / 2
      floor.position.y = -0.13
      floor.receiveShadow = true
      scene.add(floor)

      const platform = new THREE.Mesh(
        new THREE.BoxGeometry(3.75, 0.12, 1.65),
        new THREE.MeshStandardMaterial({ color: '#f2eee9', roughness: 0.62 }),
      )
      platform.position.set(0, -0.08, 0)
      platform.castShadow = true
      platform.receiveShadow = true
      scene.add(platform)

      const shoe = createShoe(THREE)
      shoe.position.y = -0.025
      scene.add(shoe)

      const handlePointerDown = (event) => {
        dragging = true
        previousX = event.clientX
        previousY = event.clientY
        renderer.domElement.setPointerCapture(event.pointerId)
      }
      const handlePointerMove = (event) => {
        if (!dragging) return
        targetRotation += (event.clientX - previousX) * 0.009
        targetTilt = THREE.MathUtils.clamp(targetTilt + (event.clientY - previousY) * 0.004, -0.2, 0.17)
        previousX = event.clientX
        previousY = event.clientY
      }
      const stopDragging = () => { dragging = false }
      renderer.domElement.addEventListener('pointerdown', handlePointerDown)
      renderer.domElement.addEventListener('pointermove', handlePointerMove)
      renderer.domElement.addEventListener('pointerup', stopDragging)
      renderer.domElement.addEventListener('pointercancel', stopDragging)

      const resize = () => {
        if (disposed || !host.clientWidth || !host.clientHeight) return
        camera.aspect = host.clientWidth / host.clientHeight
        camera.position.x = host.clientWidth < 480 ? 3.1 : 2.85
        camera.updateProjectionMatrix()
        renderer.setSize(host.clientWidth, host.clientHeight)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, host.clientWidth < 480 ? 1.2 : 1.6))
      }
      resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(host)

      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const timer = new THREE.Timer()
      const animate = () => {
        if (disposed) return
        animationFrame = requestAnimationFrame(animate)
        timer.update()
        const elapsed = timer.getElapsed()
        if (!dragging && !reducedMotion) targetRotation += 0.0014
        shoe.rotation.y += (targetRotation - shoe.rotation.y) * 0.045
        shoe.rotation.x += (targetTilt - shoe.rotation.x) * 0.045
        shoe.position.y = -0.025 + (!reducedMotion ? Math.sin(elapsed * 1.15) * 0.035 : 0)
        renderer.render(scene, camera)
        if (!hasRendered) {
          hasRendered = true
          setLoaded(true)
        }
      }
      animate()

      cleanup = () => {
        cancelAnimationFrame(animationFrame)
        resizeObserver?.disconnect()
        renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
        renderer.domElement.removeEventListener('pointermove', handlePointerMove)
        renderer.domElement.removeEventListener('pointerup', stopDragging)
        renderer.domElement.removeEventListener('pointercancel', stopDragging)
        shoe.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose()
            if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose())
            else object.material.dispose()
          }
        })
        renderer.dispose()
        renderer.domElement.remove()
      }
    } catch {
      renderer?.dispose()
      renderer?.domElement.remove()
      setFallback(true)
    }
    }).catch(() => setFallback(true))

    return () => {
      disposed = true
      cleanup()
    }
  }, [visible, fallback])

  return (
    <div className={`shoe-showcase ${fallback ? 'shoe-showcase--fallback' : ''}`} ref={hostRef}>
      {fallback && (
        <img className="shoe-showcase__fallback-image" src={fallbackImage} alt="Blush and ivory running sneaker" />
      )}
      {!loaded && !fallback && <span className="shoe-showcase__loading" role="status">Preparing the studio view</span>}
      <span className="shoe-showcase__model-tag">ASV / MODEL 01</span>
      <span className="shoe-showcase__interaction">{fallback ? 'Studio image' : 'Drag to explore'}</span>
    </div>
  )
}
