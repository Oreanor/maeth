import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { BOARD_STYLE_CONFIG, useBoardView, type ThreePieceStyle } from '@/boardView'
import { useI18n } from '@/i18n'
import { useTheme } from '@/theme'
import { isArcher, type PieceKind } from '@/game/pieces'
import { colOf, opposite, rowOf, type Color } from '@/game/types'
import { edgeArrows } from './ArrowOverlay'
import type { BoardProps } from './Board'
import './ThreeBoard.css'

const BOARD_SIZE = 6
const BOARD_THICKNESS = 0.56
// Keep only a hairline of the body visible around the artwork. The compact
// bevel still softens the board without producing a wide dark picture frame.
const BOARD_CORNER_RADIUS = 0.07
const BOARD_TEXTURE_SIZE = BOARD_SIZE - 0.12
const PLAYFIELD_SIZE = 4.24
const CELL_SIZE = PLAYFIELD_SIZE / 4
const CELL_HIGHLIGHT_SCALE = 0.82
// Keep click/highlight cells aligned to the artwork, but gather the physical
// miniatures a little closer toward the board centre.
const PIECE_GRID_SCALE = 0.94
const TOP_Y = BOARD_THICKNESS / 2 + 0.026
const PIECE_BASE_THICKNESS_SCALE = 1.5
const PIECE_BASE_HEIGHT = 0.108 * PIECE_BASE_THICKNESS_SCALE
// A GLB's bounding box bottoms out a little below the sculpted feet, so a model
// seated exactly on the base reads as hovering. Sink each piece by a fraction of
// its own height to close that gap.
const PIECE_SINK_RATIO = 0.02
const BOARD_EDGE_DARKEN = 0.56

const PIECE_BASE_GEOMETRY = new THREE.LatheGeometry(
  [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.37, 0),
    new THREE.Vector2(0.397, 0.014 * PIECE_BASE_THICKNESS_SCALE),
    new THREE.Vector2(0.405, 0.026 * PIECE_BASE_THICKNESS_SCALE),
    new THREE.Vector2(0.405, 0.082 * PIECE_BASE_THICKNESS_SCALE),
    new THREE.Vector2(0.397, 0.094 * PIECE_BASE_THICKNESS_SCALE),
    new THREE.Vector2(0.37, PIECE_BASE_HEIGHT),
    new THREE.Vector2(0, PIECE_BASE_HEIGHT),
  ],
  48,
)

const MODEL_URL: Record<PieceKind, string> = {
  nazgul: '/models/nazgul.glb',
  tomBombadil: '/models/tom.glb',
  orcArcher: '/models/orc_archer.glb',
  gondorWarrior: '/models/gondor.glb',
  balrog: '/models/balrog.glb',
  wizard: '/models/mage.glb',
  elvenWarrior: '/models/elf_warrior.glb',
  king: '/models/king.glb',
  shelob: '/models/shelob.glb',
  ent: '/models/ent.glb',
  dwarf: '/models/dwarf.glb',
  farmer: '/models/farmer.glb',
  orcChief: '/models/orc_chief.glb',
  elvenQueen: '/models/elf_queen.glb',
  hobbit: '/models/hobbit.glb',
  rohanWarrior: '/models/rohan.glb',
}

/** Per-model visual corrections after normalising GLB bounds. */
const MODEL_SCALE: Partial<Record<PieceKind, number>> = {
  rohanWarrior: 1.5,
  balrog: 1.5,
  shelob: 1.5,
  ent: 1.5,
}

const gltfLoader = new GLTFLoader()
const modelCache = new Map<PieceKind, Promise<THREE.Object3D>>()

/**
 * The source GLBs contain a pedestal as the only disconnected geometry island
 * touching the model's lowest Y. Remove that island once from the cached
 * geometry, preserving the authored figure, UVs and material.
 */
function removeEmbeddedBase(geometry: THREE.BufferGeometry) {
  if (geometry.userData.embeddedBaseRemoved) return
  const position = geometry.getAttribute('position')
  const index = geometry.index
  if (!position || !index || position.count === 0 || index.count < 3) return

  const parent = new Int32Array(position.count)
  const rank = new Uint8Array(position.count)
  for (let vertex = 0; vertex < parent.length; vertex++) parent[vertex] = vertex

  const find = (vertex: number): number => {
    let root = vertex
    while (parent[root] !== root) root = parent[root]
    while (parent[vertex] !== vertex) {
      const next = parent[vertex]
      parent[vertex] = root
      vertex = next
    }
    return root
  }
  const union = (left: number, right: number) => {
    let a = find(left)
    let b = find(right)
    if (a === b) return
    if (rank[a] < rank[b]) [a, b] = [b, a]
    parent[b] = a
    if (rank[a] === rank[b]) rank[a] += 1
  }

  // GLB export duplicates vertices along UV and normal seams. Weld equal
  // positions logically before finding connected geometry islands.
  const welded = new Map<string, number>()
  for (let vertex = 0; vertex < position.count; vertex++) {
    const key = `${position.getX(vertex).toFixed(5)}|${position.getY(vertex).toFixed(5)}|${position.getZ(vertex).toFixed(5)}`
    const match = welded.get(key)
    if (match == null) welded.set(key, vertex)
    else union(vertex, match)
  }
  for (let offset = 0; offset < index.count; offset += 3) {
    const a = index.getX(offset)
    const b = index.getX(offset + 1)
    const c = index.getX(offset + 2)
    union(a, b)
    union(b, c)
  }

  let globalMinY = Infinity
  let globalMaxY = -Infinity
  let lowestVertex = 0
  for (let vertex = 0; vertex < position.count; vertex++) {
    const y = position.getY(vertex)
    if (y < globalMinY) {
      globalMinY = y
      lowestVertex = vertex
    }
    globalMaxY = Math.max(globalMaxY, y)
  }

  const baseRoot = find(lowestVertex)
  let baseMaxY = -Infinity
  let bodyMinY = Infinity
  let bodyX = 0
  let bodyZ = 0
  let bodyVertices = 0
  for (let vertex = 0; vertex < position.count; vertex++) {
    if (find(vertex) === baseRoot) {
      baseMaxY = Math.max(baseMaxY, position.getY(vertex))
    } else {
      bodyMinY = Math.min(bodyMinY, position.getY(vertex))
      bodyX += position.getX(vertex)
      bodyZ += position.getZ(vertex)
      bodyVertices += 1
    }
  }

  const modelHeight = globalMaxY - globalMinY
  const baseHeight = baseMaxY - globalMinY
  if (!bodyVertices || modelHeight <= 0 || baseHeight / modelHeight > 0.22) return

  const retainedIndices: number[] = []
  for (let offset = 0; offset < index.count; offset += 3) {
    const a = index.getX(offset)
    if (find(a) === baseRoot) continue
    retainedIndices.push(a, index.getX(offset + 1), index.getX(offset + 2))
  }
  if (retainedIndices.length === index.count) return

  // Unreferenced base vertices remain in the attribute buffer. Collapse them
  // inside the body bounds so bounding-box-based scaling ignores the old base.
  const collapsedX = bodyX / bodyVertices
  const collapsedZ = bodyZ / bodyVertices
  for (let vertex = 0; vertex < position.count; vertex++) {
    if (find(vertex) === baseRoot) position.setXYZ(vertex, collapsedX, bodyMinY, collapsedZ)
  }
  position.needsUpdate = true
  geometry.setIndex(retainedIndices)
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  geometry.userData.embeddedBaseRemoved = true
}

function sourceModel(kind: PieceKind): Promise<THREE.Object3D> {
  const cached = modelCache.get(kind)
  if (cached) return cached
  const loading = gltfLoader.loadAsync(MODEL_URL[kind]).then((gltf) => {
    gltf.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) removeEmbeddedBase(object.geometry)
    })
    return gltf.scene
  })
  modelCache.set(kind, loading)
  return loading
}

function cellPosition(cell: number): THREE.Vector3 {
  return new THREE.Vector3((colOf(cell) - 1.5) * CELL_SIZE, TOP_Y, (rowOf(cell) - 1.5) * CELL_SIZE)
}

function piecePosition(cell: number): THREE.Vector3 {
  const position = cellPosition(cell)
  position.x *= PIECE_GRID_SCALE
  position.z *= PIECE_GRID_SCALE
  return position
}

function cloneMaterial(material: THREE.Material): THREE.Material {
  return material.clone()
}

/** Match the 3D trim to the artwork instead of maintaining ten hand-picked
 * colours. Only the outermost pixel perimeter is sampled; transparent pixels
 * are ignored. The result is darkened because this material also wraps the
 * vertical sides, which should read as the shaded continuation of the frame. */
function textureEdgeColor(texture: THREE.Texture): THREE.Color | null {
  const image = texture.image as
    | (CanvasImageSource & {
        naturalWidth?: number
        naturalHeight?: number
        videoWidth?: number
        videoHeight?: number
        width?: number
        height?: number
      })
    | null
  if (!image) return null

  const width = Math.round(image.naturalWidth ?? image.videoWidth ?? image.width ?? 0)
  const height = Math.round(image.naturalHeight ?? image.videoHeight ?? image.height ?? 0)
  if (width < 1 || height < 1) return null

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null

  try {
    context.drawImage(image, 0, 0, width, height)
    let red = 0
    let green = 0
    let blue = 0
    let weight = 0
    const addPixels = (pixels: Uint8ClampedArray) => {
      for (let offset = 0; offset < pixels.length; offset += 4) {
        const alpha = pixels[offset + 3] / 255
        if (alpha < 0.06) continue
        red += pixels[offset] * alpha
        green += pixels[offset + 1] * alpha
        blue += pixels[offset + 2] * alpha
        weight += alpha
      }
    }

    addPixels(context.getImageData(0, 0, width, 1).data)
    if (height > 1) addPixels(context.getImageData(0, height - 1, width, 1).data)
    if (height > 2) {
      addPixels(context.getImageData(0, 1, 1, height - 2).data)
      if (width > 1) addPixels(context.getImageData(width - 1, 1, 1, height - 2).data)
    }
    if (weight === 0) return null

    return new THREE.Color()
      .setRGB(red / weight / 255, green / weight / 255, blue / weight / 255, THREE.SRGBColorSpace)
      .multiplyScalar(BOARD_EDGE_DARKEN)
  } catch {
    // Canvas can be unreadable for a cross-origin texture. The configured side
    // colour remains the safe fallback in that case.
    return null
  }
}

/** Both sides of the classic set share one warm bone tone; facing direction and
 * board position tell the two players apart. Tune the carve here. */
const CLASSIC_PIECE_COLOR = 0xcbb692

function classicMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: CLASSIC_PIECE_COLOR,
    emissive: 0x2b2216,
    emissiveIntensity: 0.1,
    roughness: 0.72,
    metalness: 0.02,
  })
}

/** Lift detail out of the dark GLB textures without overexposing the board.
 * Ghosts stay depth-writing and opaque, so their outer shell hides internals. */
function tunePieceMaterial(material: THREE.Material, ghost: boolean) {
  material.transparent = false
  material.opacity = 1
  material.depthWrite = true
  material.depthTest = true
  if (!(material instanceof THREE.MeshStandardMaterial)) return

  if (ghost) {
    material.color.lerp(new THREE.Color(0xc4dce8), 0.46)
    material.emissive.set(material.map ? 0xb7d2e0 : 0x7898aa)
    material.emissiveMap = material.map
    material.emissiveIntensity = material.map ? 0.34 : 0.3
    material.roughness = Math.max(material.roughness, 0.68)
    material.metalness *= 0.3
    return
  }

  if (material.map) {
    material.emissive.set(0xffffff)
    material.emissiveMap = material.map
    material.emissiveIntensity = 0.22
  } else if (material.emissiveIntensity === 0) {
    material.emissive.copy(material.color)
    material.emissiveIntensity = 0.16
  }
}

async function createPiece(
  kind: PieceKind,
  color: Color,
  style: ThreePieceStyle,
  ghost = false,
): Promise<THREE.Group> {
  const source = await sourceModel(kind)
  const model = source.clone(true)
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.material = Array.isArray(object.material)
      ? object.material.map((material) =>
          style === 'classic' ? classicMaterial() : cloneMaterial(material),
        )
      : style === 'classic'
        ? classicMaterial()
        : cloneMaterial(object.material)
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) tunePieceMaterial(material, ghost)
    object.castShadow = !ghost
    object.receiveShadow = true
    object.userData.sharedGeometry = true
  })

  const bounds = new THREE.Box3().setFromObject(model)
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  const horizontal = Math.max(size.x, size.z, 0.001)
  const scale =
    Math.min(0.88 / horizontal, 1.02 / Math.max(size.y, 0.001)) *
    (MODEL_SCALE[kind] ?? 1)
  model.scale.setScalar(scale)
  const sink = size.y * scale * PIECE_SINK_RATIO
  model.position.set(
    -center.x * scale,
    TOP_Y + PIECE_BASE_HEIGHT - bounds.min.y * scale - sink,
    -center.z * scale,
  )

  const group = new THREE.Group()
  group.rotation.y = color === 'white' ? 0 : Math.PI
  group.add(model)

  const baseMaterial = new THREE.MeshStandardMaterial({
    color: ghost ? 0x729caf : color === 'white' ? 0x2d679b : 0x983b3b,
    emissive: ghost ? 0x284655 : color === 'white' ? 0x071b2c : 0x2d0909,
    emissiveIntensity: ghost ? 0.32 : 0.18,
    roughness: 0.64,
    metalness: 0.045,
    transparent: false,
    opacity: 1,
    depthWrite: true,
  })
  const base = new THREE.Mesh(PIECE_BASE_GEOMETRY, baseMaterial)
  base.position.y = TOP_Y + 0.004
  base.castShadow = !ghost
  base.receiveShadow = true
  base.userData.sharedGeometry = true
  group.add(base)
  return group
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    if (!child.userData.sharedGeometry) child.geometry.dispose()
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of materials) material.dispose()
  })
}

function clearGroup(group: THREE.Group) {
  for (const child of [...group.children]) {
    group.remove(child)
    disposeObject(child)
  }
}

interface ActiveThreeAnimation {
  started: number
  duration: number
  from: THREE.Vector3
  to: THREE.Vector3
  attacker: THREE.Group | null
  victim: THREE.Group | null
}

interface ThreeScene {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  pieceRoot: THREE.Group
  ghostRoot: THREE.Group
  arrowRoot: THREE.Group
  hitCells: THREE.Mesh[]
  highlights: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[]
  topMaterial: THREE.MeshStandardMaterial
  bottomMaterial: THREE.MeshStandardMaterial
  sideMaterial: THREE.MeshStandardMaterial
  groundMaterial: THREE.MeshStandardMaterial
  animation: ActiveThreeAnimation | null
  frame: number
}

function pointerCell(
  event: PointerEvent,
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
  cells: THREE.Mesh[],
): number | null {
  const rect = canvas.getBoundingClientRect()
  const pointer = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  )
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(pointer, camera)
  const hit = raycaster.intersectObjects(cells, false)[0]
  return typeof hit?.object.userData.cell === 'number' ? hit.object.userData.cell : null
}

function addArrow(root: THREE.Group, from: THREE.Vector3, to: THREE.Vector3, color: number) {
  const delta = to.clone().sub(from)
  const length = delta.length()
  if (length < 0.01) return
  const direction = delta.normalize()
  const start = from.clone().addScaledVector(direction, 0.3)
  start.y = TOP_Y + 0.13
  const arrowLength = Math.max(0.15, length - 0.48)
  const headLength = Math.min(0.2, arrowLength * 0.45)
  const shaftLength = Math.max(0.01, arrowLength - headLength)
  // ArrowHelper uses a one-pixel WebGL line whose linewidth is ignored by most
  // browsers. A 0.07-unit cylinder reads as roughly eight pixels at board scale.
  const shaftRadius = 0.035
  const orientation = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction,
  )
  const material = new THREE.MeshBasicMaterial({ color, depthWrite: false })
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 12),
    material,
  )
  shaft.position.copy(start).addScaledVector(direction, shaftLength / 2)
  shaft.quaternion.copy(orientation)
  shaft.renderOrder = 10

  const head = new THREE.Mesh(new THREE.ConeGeometry(0.13, headLength, 16), material)
  head.position.copy(start).addScaledVector(direction, shaftLength + headLength / 2)
  head.quaternion.copy(orientation)
  head.renderOrder = 10

  const arrow = new THREE.Group()
  arrow.add(shaft, head)
  root.add(arrow)
}

export function ThreeBoard(props: BoardProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<ThreeScene | null>(null)
  const propsRef = useRef(props)
  const syncIdRef = useRef(0)
  const ghostIdRef = useRef(0)
  const { boardStyle, threePieceStyle } = useBoardView()
  const { theme } = useTheme()
  const { t } = useI18n()
  const [loading, setLoading] = useState(true)
  propsRef.current = props

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100)
    const cameraSign = props.orientation === 'white' ? 1 : -1
    camera.position.set(7 * cameraSign, 7.3, 8.2 * cameraSign)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.08
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.domElement.className = 'three-board__canvas'
    renderer.domElement.setAttribute('aria-hidden', 'true')
    host.prepend(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.075
    controls.enablePan = false
    controls.enableZoom = true
    controls.touches.ONE = THREE.TOUCH.ROTATE
    controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE
    controls.minDistance = 7.2
    controls.maxDistance = 16
    controls.minPolarAngle = 0.22
    // Let the player tilt past the horizon to inspect the authored underside,
    // while keeping a comfortable limit that avoids an upside-down camera.
    controls.maxPolarAngle = Math.PI * 0.72
    controls.target.set(0, 0.05, 0)

    const ambient = new THREE.HemisphereLight(0xf4eee3, 0x1b2430, 2.15)
    scene.add(ambient)
    const key = new THREE.DirectionalLight(0xfff2d6, 4.2)
    key.position.set(-5, 9, 6)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.camera.left = -7
    key.shadow.camera.right = 7
    key.shadow.camera.top = 7
    key.shadow.camera.bottom = -7
    scene.add(key)
    const fill = new THREE.DirectionalLight(0x8eb7ff, 1.35)
    fill.position.set(6, 4, -5)
    scene.add(fill)
    const underside = new THREE.DirectionalLight(0xf1d5ad, 2.15)
    underside.position.set(4, -6, -3)
    scene.add(underside)

    const topMaterial = new THREE.MeshStandardMaterial({ roughness: 0.64, metalness: 0.02 })
    const bottomMaterial = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0.02 })
    const sideMaterial = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.1 })
    const body = new THREE.Mesh(
      new RoundedBoxGeometry(BOARD_SIZE, BOARD_THICKNESS, BOARD_SIZE, 4, BOARD_CORNER_RADIUS),
      sideMaterial,
    )
    body.castShadow = true
    body.receiveShadow = true
    scene.add(body)

    const top = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD_TEXTURE_SIZE, BOARD_TEXTURE_SIZE),
      topMaterial,
    )
    top.rotation.x = -Math.PI / 2
    top.position.y = BOARD_THICKNESS / 2 + 0.012
    top.receiveShadow = true
    scene.add(top)

    const bottom = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD_TEXTURE_SIZE, BOARD_TEXTURE_SIZE),
      bottomMaterial,
    )
    bottom.rotation.x = Math.PI / 2
    bottom.position.y = -BOARD_THICKNESS / 2 - 0.012
    scene.add(bottom)

    const groundMaterial = new THREE.MeshStandardMaterial({ roughness: 0.94, metalness: 0 })
    const ground = new THREE.Mesh(new THREE.CircleGeometry(18, 96), groundMaterial)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.42
    ground.receiveShadow = true
    scene.add(ground)

    const pieceRoot = new THREE.Group()
    const ghostRoot = new THREE.Group()
    const arrowRoot = new THREE.Group()
    scene.add(pieceRoot, ghostRoot, arrowRoot)

    const hitCells: THREE.Mesh[] = []
    const highlights: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = []
    for (let cell = 0; cell < 16; cell++) {
      const position = cellPosition(cell)
      const hit = new THREE.Mesh(
        new THREE.PlaneGeometry(CELL_SIZE * 0.96, CELL_SIZE * 0.96),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, side: THREE.DoubleSide }),
      )
      hit.rotation.x = -Math.PI / 2
      hit.position.copy(position)
      hit.position.y += 0.035
      hit.userData.cell = cell
      scene.add(hit)
      hitCells.push(hit)

      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      const highlight = new THREE.Mesh(
        new THREE.PlaneGeometry(
          CELL_SIZE * CELL_HIGHLIGHT_SCALE,
          CELL_SIZE * CELL_HIGHLIGHT_SCALE,
        ),
        material,
      )
      highlight.rotation.x = -Math.PI / 2
      highlight.position.copy(position)
      highlight.position.y += 0.045
      highlight.visible = false
      scene.add(highlight)
      highlights.push(highlight)
    }

    const threeScene: ThreeScene = {
      scene,
      camera,
      renderer,
      controls,
      pieceRoot,
      ghostRoot,
      arrowRoot,
      hitCells,
      highlights,
      topMaterial,
      bottomMaterial,
      sideMaterial,
      groundMaterial,
      animation: null,
      frame: 0,
    }
    sceneRef.current = threeScene

    const resize = () => {
      const width = host.clientWidth || window.innerWidth
      const height = host.clientHeight || window.innerHeight
      camera.aspect = width / Math.max(1, height)
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }
    resize()
    window.addEventListener('resize', resize)

    let pointerStart: { x: number; y: number } | null = null
    let lastHover: number | null = null
    const activePointers = new Set<number>()
    let multiTouchGesture = false
    const canvas = renderer.domElement
    const onPointerDown = (event: PointerEvent) => {
      activePointers.add(event.pointerId)
      if (activePointers.size > 1) {
        multiTouchGesture = true
        pointerStart = null
      } else {
        pointerStart = { x: event.clientX, y: event.clientY }
      }
      canvas.classList.add('three-board__canvas--dragging')
    }
    const onPointerMove = (event: PointerEvent) => {
      const current = propsRef.current
      if (!current.interactive || pointerStart) return
      const cell = pointerCell(event, canvas, camera, hitCells)
      canvas.classList.toggle('three-board__canvas--cell', cell != null)
      if (cell != null && cell !== lastHover) {
        lastHover = cell
        current.onCellEnter?.(cell)
      }
    }
    const onPointerUp = (event: PointerEvent) => {
      canvas.classList.remove('three-board__canvas--dragging')
      activePointers.delete(event.pointerId)
      if (multiTouchGesture) {
        pointerStart = null
        if (activePointers.size === 0) multiTouchGesture = false
        return
      }
      const start = pointerStart
      pointerStart = null
      if (!start || !propsRef.current.interactive) return
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return
      const cell = pointerCell(event, canvas, camera, hitCells)
      if (cell != null) propsRef.current.onCellClick(cell)
    }
    const onPointerLeave = (event: PointerEvent) => {
      pointerStart = null
      lastHover = null
      activePointers.clear()
      multiTouchGesture = false
      canvas.classList.remove('three-board__canvas--dragging', 'three-board__canvas--cell')
      // A touch pointer stops existing the instant the finger lifts, firing
      // leave right after the tap that set the draft preview. Only a real
      // cursor travelling off the board should clear that preview.
      if (event.pointerType === 'mouse') propsRef.current.onBoardLeave?.()
    }
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerLeave)
    canvas.addEventListener('pointerleave', onPointerLeave)

    const render = (time: number) => {
      threeScene.frame = requestAnimationFrame(render)
      controls.update()
      const animation = threeScene.animation
      if (animation) {
        const progress = Math.min(1, (time - animation.started) / animation.duration)
        const eased = 1 - (1 - progress) ** 3
        if (animation.attacker) animation.attacker.position.lerpVectors(animation.from, animation.to, eased)
        if (animation.victim) animation.victim.scale.setScalar(Math.max(0.001, 1 - eased))
      }
      renderer.render(scene, camera)
    }
    threeScene.frame = requestAnimationFrame(render)

    return () => {
      syncIdRef.current += 1
      ghostIdRef.current += 1
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerLeave)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      cancelAnimationFrame(threeScene.frame)
      controls.dispose()
      clearGroup(pieceRoot)
      clearGroup(ghostRoot)
      clearGroup(arrowRoot)
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        if (!object.userData.sharedGeometry) object.geometry.dispose()
      })
      topMaterial.map?.dispose()
      bottomMaterial.map?.dispose()
      topMaterial.dispose()
      bottomMaterial.dispose()
      sideMaterial.dispose()
      groundMaterial.dispose()
      renderer.dispose()
      canvas.remove()
      sceneRef.current = null
    }
  }, [props.orientation])

  useEffect(() => {
    const current = sceneRef.current
    if (!current) return
    current.renderer.setClearColor(theme === 'dark' ? 0x080d14 : 0xd9e1eb, 1)
    current.groundMaterial.color.set(theme === 'dark' ? 0x111923 : 0xc8d1dc)
  }, [theme])

  useEffect(() => {
    const current = sceneRef.current
    if (!current) return
    const config = BOARD_STYLE_CONFIG[boardStyle]
    current.sideMaterial.color.set(config.side)
    current.sideMaterial.metalness = config.metalness
    current.sideMaterial.roughness = config.roughness
    let active = true
    const loader = new THREE.TextureLoader()
    void Promise.all([loader.loadAsync(config.top), loader.loadAsync(config.bottom)]).then(
      ([top, bottom]) => {
        if (!active) {
          top.dispose()
          bottom.dispose()
          return
        }
        const maxAnisotropy = current.renderer.capabilities.getMaxAnisotropy()
        for (const texture of [top, bottom]) {
          texture.colorSpace = THREE.SRGBColorSpace
          texture.anisotropy = Math.min(8, maxAnisotropy)
        }
        current.topMaterial.map?.dispose()
        current.bottomMaterial.map?.dispose()
        current.topMaterial.map = top
        current.bottomMaterial.map = bottom
        const sampledSide = textureEdgeColor(top)
        if (sampledSide) current.sideMaterial.color.copy(sampledSide)
        current.topMaterial.needsUpdate = true
        current.bottomMaterial.needsUpdate = true
        setLoading(false)
      },
      () => setLoading(false),
    )
    return () => {
      active = false
    }
  }, [boardStyle])

  // Board pieces and the move animation. Kept apart from the cheap highlight
  // and arrow passes below: every run here clones a GLB and builds fresh
  // materials per mesh, so it must not re-run on mere hover or selection.
  useEffect(() => {
    const current = sceneRef.current
    if (!current) return
    const syncId = ++syncIdRef.current
    current.animation = null
    clearGroup(current.pieceRoot)

    const anim = props.anim
    const archerShot = Boolean(anim && isArcher(anim.attacker) && anim.kind === 'capture')
    const hidden = new Set<number>()
    if (anim && anim.kind !== 'duel') {
      if (!archerShot) hidden.add(anim.from)
      if (anim.kind === 'capture') hidden.add(anim.to)
    }

    const tasks: Promise<void>[] = []
    props.board.forEach((piece, cell) => {
      if (!piece || hidden.has(cell)) return
      tasks.push(
        createPiece(piece.kind, piece.color, threePieceStyle).then((object) => {
          if (syncId !== syncIdRef.current) {
            disposeObject(object)
            return
          }
          object.position.copy(piecePosition(cell))
          object.position.y = 0
          if (piece.moved) object.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              const materials = Array.isArray(child.material) ? child.material : [child.material]
              for (const material of materials) {
                material.transparent = true
                material.opacity *= 0.58
              }
            }
          })
          current.pieceRoot.add(object)
        }),
      )
    })

    if (anim && anim.kind !== 'duel') {
      let attacker: THREE.Group | null = null
      let victim: THREE.Group | null = null
      if (!archerShot) {
        tasks.push(
          createPiece(anim.attacker, anim.owner, threePieceStyle).then((object) => {
            if (syncId !== syncIdRef.current) {
              disposeObject(object)
              return
            }
            attacker = object
            object.position.copy(piecePosition(anim.from))
            object.position.y = 0
            current.pieceRoot.add(object)
          }),
        )
      }
      if (anim.kind === 'capture' && anim.victim) {
        tasks.push(
          createPiece(anim.victim, opposite(anim.owner), threePieceStyle).then((object) => {
            if (syncId !== syncIdRef.current) {
              disposeObject(object)
              return
            }
            victim = object
            object.position.copy(piecePosition(anim.to))
            object.position.y = 0
            current.pieceRoot.add(object)
          }),
        )
      }
      void Promise.all(tasks).then(() => {
        if (syncId !== syncIdRef.current) return
        const from = piecePosition(anim.from)
        const to = piecePosition(anim.to)
        from.y = 0
        to.y = 0
        current.animation = {
          started: performance.now(),
          duration: archerShot ? 560 : 900,
          from,
          to,
          attacker,
          victim,
        }
      })
    } else {
      void Promise.all(tasks).then(() => {
        if (syncId === syncIdRef.current) setLoading(false)
      })
    }
  }, [props.anim, props.board, threePieceStyle])

  // The draft ghost lives in its own group, so following the cursor rebuilds
  // one piece instead of the whole board.
  useEffect(() => {
    const current = sceneRef.current
    if (!current) return
    const ghostId = ++ghostIdRef.current
    clearGroup(current.ghostRoot)
    const cell = props.previewCell
    const kind = props.previewKind
    if (cell == null || !kind) return
    void createPiece(kind, props.previewOwner, threePieceStyle, true).then((object) => {
      if (ghostId !== ghostIdRef.current) {
        disposeObject(object)
        return
      }
      object.position.copy(piecePosition(cell))
      object.position.y = 0
      current.ghostRoot.add(object)
    })
  }, [props.previewCell, props.previewKind, props.previewOwner, threePieceStyle])

  // Cell highlights: colour/opacity writes on materials that already exist.
  useEffect(() => {
    const current = sceneRef.current
    if (!current) return
    const captureTargets = new Set(props.selectedMoves.filter((move) => move.capture).map((move) => move.to))
    for (let cell = 0; cell < 16; cell++) {
      const material = current.highlights[cell].material
      let color = 0xffffff
      let opacity = 0
      if (props.selected === cell) {
        color = 0xf6c945
        opacity = 0.45
      } else if (captureTargets.has(cell)) {
        color = 0xe23b34
        opacity = 0.42
      } else if (props.legalTargets.includes(cell)) {
        color = 0x3fae5a
        opacity = 0.34
      } else if (props.placementTargets.includes(cell)) {
        color = 0x4a90d9
        opacity = 0.27
      }
      material.color.setHex(color)
      material.opacity = opacity
      current.highlights[cell].visible = opacity > 0
    }
  }, [props.legalTargets, props.placementTargets, props.selected, props.selectedMoves])

  // Arrows: cheap line rebuilds, including the archer's shot during a capture.
  useEffect(() => {
    const current = sceneRef.current
    if (!current) return
    clearGroup(current.arrowRoot)
    const arrowFrom = props.selected ?? props.previewCell
    if (props.selected != null) {
      for (const move of props.selectedMoves) {
        addArrow(
          current.arrowRoot,
          cellPosition(move.from),
          cellPosition(move.to),
          move.capture ? 0xe23b34 : 0x3fae5a,
        )
      }
    } else if (arrowFrom != null && props.previewKind) {
      for (const arrow of edgeArrows(arrowFrom, props.previewKind, '#4a90d9')) {
        const from = cellPosition(arrowFrom)
        const to = from
          .clone()
          .add(new THREE.Vector3(arrow.dc * arrow.len * CELL_SIZE, 0, arrow.dr * arrow.len * CELL_SIZE))
        addArrow(current.arrowRoot, from, to, 0x4a90d9)
      }
    }
    const anim = props.anim
    if (anim && isArcher(anim.attacker) && anim.kind === 'capture') {
      addArrow(current.arrowRoot, cellPosition(anim.from), cellPosition(anim.to), 0xf0b84b)
    }
  }, [props.anim, props.previewCell, props.previewKind, props.selected, props.selectedMoves])

  return (
    <div ref={hostRef} className="three-board-shell" aria-label={t('board.threeView')}>
      {loading && <div className="three-board__loading">{t('board.loading3d')}</div>}
    </div>
  )
}
