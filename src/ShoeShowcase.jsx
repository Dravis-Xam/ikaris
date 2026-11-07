import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows, Environment, Float, OrbitControls, RoundedBox } from '@react-three/drei'
import gsap from 'gsap'
import { useEffect, useRef } from 'react'

const fallbackImage = '/images/vennetta-runner.jpg'

function HeroShoe({ palette }) {
  const groupRef = useRef(null)

  useEffect(() => {
    if (!groupRef.current) return undefined

    const timeline = gsap.timeline({
      repeat: -1,
      yoyo: true,
      defaults: { ease: 'sine.inOut' },
    })

    timeline.to(groupRef.current.rotation, { y: 1.5, duration: 3.2 }, 0)
    timeline.to(groupRef.current.position, { y: 0.2, duration: 1.8 }, 0)

    return () => timeline.kill()
  }, [])

  useFrame((state) => {
    const elapsed = state.clock.getElapsedTime()

    if (!groupRef.current) return

    groupRef.current.rotation.y = 0.9 + Math.sin(elapsed * 0.9) * 0.35
    groupRef.current.rotation.x = -0.35 + Math.sin(elapsed * 1.2) * 0.12
    groupRef.current.rotation.z = Math.sin(elapsed * 1.1) * 0.08
    groupRef.current.position.y = Math.sin(elapsed * 1.4) * 0.12
  })

  return (
    <group ref={groupRef} position={[0, -0.35, 0]} scale={1.15}>
      <mesh position={[0, -0.7, 0]} rotation={[0.15, 0, 0]} castShadow receiveShadow>
        <capsuleGeometry args={[0.82, 4.2, 8, 18]} />
        <meshStandardMaterial color={palette.sole ?? '#d9bb91'} roughness={0.88} />
      </mesh>

      <RoundedBox args={[3.8, 0.68, 1.8]} position={[0.2, 0.18, 0]} radius={0.18} smoothness={6} castShadow receiveShadow>
        <meshStandardMaterial color={palette.upper ?? '#f3ecdf'} roughness={0.72} metalness={0.04} />
      </RoundedBox>

      <RoundedBox args={[2.1, 0.48, 1.45]} position={[-0.2, 0.48, 0]} radius={0.15} smoothness={5} castShadow receiveShadow>
        <meshStandardMaterial color={palette.detail ?? '#f8f4f0'} roughness={0.76} />
      </RoundedBox>

      <mesh position={[1.1, 0.55, 0]} rotation={[0, 0, 0.25]} castShadow receiveShadow>
        <sphereGeometry args={[0.38, 32, 32]} />
        <meshStandardMaterial color={palette.accent ?? '#b97b66'} roughness={0.8} />
      </mesh>

      <mesh position={[-1.4, 0.65, 0]} rotation={[0.12, 0, 0.09]} castShadow receiveShadow>
        <boxGeometry args={[0.82, 0.14, 1.1]} />
        <meshStandardMaterial color={palette.detail ?? '#f7f1ed'} roughness={0.82} />
      </mesh>

      <mesh position={[-0.85, 0.88, 0]} rotation={[0.18, 0, 0.15]} castShadow receiveShadow>
        <boxGeometry args={[1.15, 0.14, 0.5]} />
        <meshStandardMaterial color={palette.accent ?? '#bc7d69'} roughness={0.74} />
      </mesh>

      {[-0.75, -0.4, -0.05, 0.3].map((offset, index) => (
        <mesh
          key={offset}
          position={[offset, 0.92, index % 2 === 0 ? -0.42 : 0.42]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
          receiveShadow
        >
          <cylinderGeometry args={[0.025, 0.025, 0.65, 12]} />
          <meshStandardMaterial color={palette.detail ?? '#fffaf5'} roughness={0.76} />
        </mesh>
      ))}

      <mesh position={[-0.7, 0.1, 0.7]} rotation={[0.15, 0, 0.18]} castShadow receiveShadow>
        <boxGeometry args={[2.45, 0.04, 0.05]} />
        <meshStandardMaterial color={palette.accent ?? '#c68a74'} roughness={0.8} />
      </mesh>
      <mesh position={[-0.7, 0.1, -0.7]} rotation={[0.15, 0, 0.18]} castShadow receiveShadow>
        <boxGeometry args={[2.45, 0.04, 0.05]} />
        <meshStandardMaterial color={palette.accent ?? '#c68a74'} roughness={0.8} />
      </mesh>
    </group>
  )
}

export default function ShoeShowcase({ product }) {
  const productPalette = product?.palette ?? { upper: '#f6eee7', accent: '#bc7d69', sole: '#d9bb91', detail: '#f8f2ee' }
  const supportsWebGL = typeof window !== 'undefined' && (() => {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
  })()

  if (!supportsWebGL) {
    return (
      <div className="shoe-showcase shoe-showcase--fallback">
        <img className="shoe-showcase__fallback-image" src={product?.images?.[0] ?? fallbackImage} alt="Featured running sneaker" />
        <span className="shoe-showcase__model-tag">ASV / MODEL 01</span>
        <span className="shoe-showcase__interaction">Studio image</span>
      </div>
    )
  }

  return (
    <div className="shoe-showcase">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0.4, 1.2, 5], fov: 32 }}
      >
        <color attach="background" args={['#f9f4ef']} />
        <fog attach="fog" args={['#f9f4ef', 5.5, 11]} />
        <ambientLight intensity={1.3} />
        <directionalLight position={[-3, 5, 4]} intensity={2.8} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
        <directionalLight position={[3, 2, -2]} intensity={1.2} color="#f2d6bf" />
        <Float speed={1.2} rotationIntensity={0.55} floatIntensity={0.7}>
          <HeroShoe palette={productPalette} />
        </Float>
        <ContactShadows position={[0, -1.32, 0]} opacity={0.36} scale={6.2} blur={1.7} far={2.4} />
        <Environment preset="studio" />
        <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={Math.PI / 2.6} maxPolarAngle={Math.PI / 2.1} autoRotate autoRotateSpeed={1.2} />
      </Canvas>
      <span className="shoe-showcase__model-tag">ASV / MODEL 01</span>
      <span className="shoe-showcase__interaction">Drag to explore</span>
    </div>
  )
}
