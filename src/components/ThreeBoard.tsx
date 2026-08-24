import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { BOARD_STYLE_CONFIG, useBoardView, type ThreePieceStyle } from '@/boardView'
import { useI18n } from '@/i18n'
import { isArcher, pieceName, type PieceKind } from '@/game/pieces'
import { colOf, opposite, rowOf, type Color } from '@/game/types'
import { sourceModel } from '@/three/pieceModels'
import {
  chessMaterial,
  paintedMaterial,
  markSpent,
  tunePieceMaterial,
} from '@/three/pieceMaterials'
import { edgeArrows } from './ArrowOverlay'
import {
  ARCHER_SHOT_HEX,
  CAPTURE_HEX,
  MOVE_HEX,
  OWNER_COLOR,
  OWNER_HEX,
  SELECT_HEX,
} from '@/palette'
import { PieceBadge } from './PieceBadge'
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
/** The painted face of the board — the surface pieces stand on. */
const BOARD_FACE_Y = BOARD_THICKNESS / 2 + 0.012
/** Highlights and arrows ride just above the face so they do not z-fight it.
 *  Pieces must not: that clearance is what left them hovering. */
const TOP_Y = BOARD_FACE_Y + 0.014
// Sink the authored pedestal by only a hair, hiding floating-point gaps without
// burying its lower moulding in the board.
const PIECE_SINK_RATIO = 0.003

// ── easter egg ──────────────────────────────────────────────────────────────
// Let go of the board while it is really spinning and the pieces are thrown off
// it. The board coasts to a stop on OrbitControls' own damping, and once it has
// settled the same pieces are put back where they were.
/** Radians per frame at the moment of release that count as a flick. */
const FLING_RELEASE_SPEED = 0.07
/** How long the pieces stay off the board before it is set up again. */
const FLING_SETTLE_MS = 2300
const FLING_GRAVITY = 9
/** Outward, and along the direction of the spin. */
const FLING_OUTWARD = 3.4
const FLING_TANGENT = 2.6
const FLING_LIFT = 3.2
/** How quickly a piece that has come down on the board loses what is left of
 *  its motion. */
const LANDED_DAMPING = 0.06
const BOARD_EDGE_DARKEN = 0.56

/** Large silhouettes need the same modest correction after normalisation. */
const MODEL_SCALE: Partial<Record<PieceKind, number>> = {
  rohanWarrior: 1.38,
  balrog: 1.32,
  shelob: 1.2,
  ent: 1.2,
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
          style === 'painted' ? paintedMaterial(material) : chessMaterial(style, color),
        )
      : style === 'painted'
        ? paintedMaterial(object.material)
        : chessMaterial(style, color)
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) tunePieceMaterial(material, ghost)
    object.castShadow = !ghost
    // Pieces cast onto the board but do not catch each other's shadows: that is
    // a PCF lookup on every pixel of the thing that fills the screen when you
    // zoom in, for an effect you have to hunt for. Their bases still receive.
    object.receiveShadow = false
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
    BOARD_FACE_Y - bounds.min.y * scale - sink,
    -center.z * scale,
  )

  const group = new THREE.Group()
  group.rotation.y = color === 'white' ? 0 : Math.PI
  group.add(model)
  // Height of the sculpted figure above the board, so the overlay can park a
  // label just clear of its crown rather than at a guessed fixed height.
  group.userData.topY = BOARD_FACE_Y + size.y * scale - sink
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
  /** Body, face and underside — hidden until the artwork for them arrives. */
  boardParts: THREE.Mesh[]
  topMaterial: THREE.MeshStandardMaterial
  bottomMaterial: THREE.MeshStandardMaterial
  sideMaterial: THREE.MeshStandardMaterial
  animation: ActiveThreeAnimation | null
  /** Ask for a redraw; the loop is otherwise idle. */
  invalidate: () => void
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

function pointerPieceCell(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
  pieceRoot: THREE.Group,
): number | null {
  const rect = canvas.getBoundingClientRect()
  const pointer = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  )
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(pointer, camera)
  for (const hit of raycaster.intersectObjects(pieceRoot.children, true)) {
    for (let node: THREE.Object3D | null = hit.object; node; node = node.parent) {
      if (typeof node.userData.cell === 'number') return node.userData.cell
      if (node === pieceRoot) break
    }
  }
  return null
}

// Both ends stop short of a cell centre: the tail so it emerges from under the
// piece's base rather than through it, the head so it points at the target
// square instead of landing on it.
const ARROW_TAIL_GAP = 0.3
const ARROW_HEAD_GAP = 0.09

function addArrow(root: THREE.Group, from: THREE.Vector3, to: THREE.Vector3, color: number) {
  const delta = to.clone().sub(from)
  const length = delta.length()
  if (length < 0.01) return
  const direction = delta.normalize()
  const start = from.clone().addScaledVector(direction, ARROW_TAIL_GAP)
  start.y = TOP_Y + 0.13
  const arrowLength = Math.max(0.15, length - ARROW_TAIL_GAP - ARROW_HEAD_GAP)
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
  // Label elements are positioned imperatively every frame, so they are held by
  // ref rather than re-rendered as the camera moves.
  const badgeRefs = useRef(new Map<number, HTMLDivElement>())
  const hoverRef = useRef<number | null>(null)
  const { boardStyle, threePieceStyle } = useBoardView()
  const { t } = useI18n()
  const [loading, setLoading] = useState(true)
  const [hoverCell, setHoverCell] = useState<number | null>(null)
  /** Bumped to rebuild the board after the pieces have been thrown off it. */
  const [restoreToken, setRestoreToken] = useState(0)

  // Every effect below mutates the scene imperatively, so rather than have each
  // remember to ask for a frame, any render at all buys one. Async model and
  // texture loads still invalidate by hand — they arrive without a render.
  useEffect(() => {
    sceneRef.current?.invalidate()
  })
  propsRef.current = props

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100)
    const cameraSign = props.orientation === 'white' ? 1 : -1
    camera.position.set(7 * cameraSign, 7.3, 8.2 * cameraSign)

    // MSAA stays on: without it the piece silhouettes read as too jagged to
    // trade for the frame time. The per-pixel savings came from the shadow and
    // texture work instead.
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.08
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    // The shadow map is a 2048² depth pass. three re-renders it every frame by
    // default, but this scene only changes when a piece appears, moves or the
    // board is restyled — so it is refreshed on demand instead.
    renderer.shadowMap.autoUpdate = false
    renderer.shadowMap.needsUpdate = true
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    // Nothing is drawn behind the board, so the canvas clears to nothing and the
    // shell's gradient shows through — a backdrop the compositor paints once,
    // rather than geometry the GPU shades every frame.
    renderer.setClearAlpha(0)
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

    const ambient = new THREE.HemisphereLight(0xf4eee3, 0x1b2430, 2.9)
    scene.add(ambient)
    const key = new THREE.DirectionalLight(0xfff2d6, 4.8)
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
    // The board stays hidden until its textures land: an untextured slab
    // appearing first and repainting a moment later reads as a glitch.
    body.visible = false
    scene.add(body)

    const top = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD_TEXTURE_SIZE, BOARD_TEXTURE_SIZE),
      topMaterial,
    )
    top.rotation.x = -Math.PI / 2
    top.position.y = BOARD_FACE_Y
    top.receiveShadow = true
    top.visible = false
    scene.add(top)

    const bottom = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD_TEXTURE_SIZE, BOARD_TEXTURE_SIZE),
      bottomMaterial,
    )
    bottom.rotation.x = Math.PI / 2
    bottom.position.y = -BOARD_THICKNESS / 2 - 0.012
    bottom.visible = false
    scene.add(bottom)

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
      // replaced below, once the loop owns the dirty flag
      boardParts: [body, top, bottom],
      invalidate: () => {},
      controls,
      pieceRoot,
      ghostRoot,
      arrowRoot,
      hitCells,
      highlights,
      topMaterial,
      bottomMaterial,
      sideMaterial,
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
      threeScene.invalidate()
    }
    resize()
    window.addEventListener('resize', resize)

    let pointerStart: { x: number; y: number } | null = null
    let hoverProbe: { x: number; y: number } | null = null
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
      if (pointerStart) return
      // Inspecting a piece works whoever's turn it is, so hover is tracked
      // before the interactivity gate that guards the draft preview.
      hoverProbe = { x: event.clientX, y: event.clientY }
      threeScene.invalidate()
      if (!current.interactive) return
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
      // Released mid-spin: throw the pieces off. Checked before the click paths
      // below, which a flick never reaches — it is a drag, not a tap.
      if (!flung && Math.abs(spinSpeed) > FLING_RELEASE_SPEED) {
        flung = throwPieces(Math.sign(spinSpeed))
        if (flung) {
          flungAt = performance.now()
          threeScene.invalidate()
        }
      }
      const start = pointerStart
      pointerStart = null
      if (!start || !propsRef.current.interactive) return
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return
      const cell = pointerCell(event, canvas, camera, hitCells)
      if (cell != null) propsRef.current.onCellClick(cell)
    }
    const onPointerLeave = (event: PointerEvent) => {
      threeScene.invalidate()
      pointerStart = null
      lastHover = null
      activePointers.clear()
      multiTouchGesture = false
      canvas.classList.remove(
        'three-board__canvas--dragging',
        'three-board__canvas--cell',
        'three-board__canvas--own',
      )
      hoverProbe = null
      hoverRef.current = null
      setHoverCell(null)
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

    // Labels are HTML so they match the 2D badge exactly; each frame their
    // anchor point is projected from world space to canvas pixels.
    const labelAnchor = new THREE.Vector3()
    const placeLabel = (el: HTMLElement, x: number, y: number, z: number, lift: number) => {
      labelAnchor.set(x, y + lift, z).project(camera)
      if (labelAnchor.z > 1) {
        el.style.opacity = '0'
        return
      }
      const px = (labelAnchor.x * 0.5 + 0.5) * canvas.clientWidth
      const py = (-labelAnchor.y * 0.5 + 0.5) * canvas.clientHeight
      el.style.transform = `translate(-50%, -100%) translate(${px}px, ${py}px)`
      el.style.opacity = '1'
    }

    const positionLabels = () => {
      if (hoverProbe) {
        const hovered = pointerPieceCell(hoverProbe.x, hoverProbe.y, canvas, camera, pieceRoot)
        hoverProbe = null
        if (hovered !== hoverRef.current) {
          hoverRef.current = hovered
          setHoverCell(hovered)
        }
      }
      const hoveredCell = hoverRef.current
      canvas.classList.toggle(
        'three-board__canvas--own',
        hoveredCell != null && (propsRef.current.movable?.includes(hoveredCell) ?? false),
      )

      const placed = new Set<number>()
      for (const piece of pieceRoot.children) {
        const cell = piece.userData.cell
        if (typeof cell !== 'number') continue
        placed.add(cell)
        const top = (piece.userData.topY as number | undefined) ?? 1
        const badge = badgeRefs.current.get(cell)
        if (badge) placeLabel(badge, piece.position.x, top, piece.position.z, 0.12)
      }
      for (const [cell, badge] of badgeRefs.current) {
        if (!placed.has(cell)) badge.style.opacity = '0'
      }
    }

    // Nothing on this board moves by itself, so the loop draws only while the
    // camera is moving, a piece is animating, or something asked it to. A canvas
    // that is dirty every frame is not only its own cost: the browser has to
    // recomposite it and recompute any blurred backdrop above it just as often.
    /** A piece in the air, turning about its own axis as it goes. */
    interface FlungPiece {
      object: THREE.Object3D
      velocity: THREE.Vector3
      axis: THREE.Vector3
      rate: number
    }
    let flung: FlungPiece[] | null = null
    let flungAt = 0
    let azimuth = controls.getAzimuthalAngle()
    let spinSpeed = 0
    let lastFrame = 0

    /**
     * Throws the pieces off the board.
     *
     * A flick sends them outward and around with the spin, tumbling freely. A
     * shake does not throw them anywhere much — it pulls the ground from under
     * them, so they barely leave their squares and topple, turning about a
     * horizontal axis across their fall rather than spinning on the spot.
     */
    /** Throws the pieces off the board, outward and around with the spin. */
    const throwPieces = (direction: number) => {
      const thrown: FlungPiece[] = []
      for (const piece of pieceRoot.children) {
        if (typeof piece.userData.cell !== 'number') continue
        const outward = new THREE.Vector3(piece.position.x, 0, piece.position.z)
        // A piece sitting dead centre has no outward direction of its own.
        if (outward.lengthSq() < 1e-6) outward.set(Math.random() - 0.5, 0, Math.random() - 0.5)
        outward.normalize()
        const tangent = new THREE.Vector3(-outward.z, 0, outward.x).multiplyScalar(direction)
        thrown.push({
          object: piece,
          velocity: outward
            .clone()
            .multiplyScalar(FLING_OUTWARD * (0.8 + Math.random() * 0.5))
            .addScaledVector(tangent, FLING_TANGENT * (0.7 + Math.random() * 0.6))
            .setY(FLING_LIFT * (0.7 + Math.random() * 0.7)),
          axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
            .normalize(),
          rate: (6 + Math.random() * 6) * (Math.random() < 0.5 ? -1 : 1),
        })
      }
      return thrown.length ? thrown : null
    }

    let dirtyFrames = 2
    threeScene.invalidate = () => {
      dirtyFrames = 2
    }

    const render = (time: number) => {
      threeScene.frame = requestAnimationFrame(render)
      const moving = controls.update()
      const animation = threeScene.animation

      const nextAzimuth = controls.getAzimuthalAngle()
      let turned = nextAzimuth - azimuth
      if (turned > Math.PI) turned -= 2 * Math.PI
      else if (turned < -Math.PI) turned += 2 * Math.PI
      azimuth = nextAzimuth
      // Smoothed, so one jittery frame cannot pass for a flick.
      spinSpeed = spinSpeed * 0.6 + turned * 0.4

      const step = lastFrame ? Math.min(0.05, (time - lastFrame) / 1000) : 0
      lastFrame = time

      if (!moving && !animation && !flung) {
        if (dirtyFrames <= 0) return
        dirtyFrames -= 1
      }

      if (flung) {
        // The pieces are moving, so their shadows have to move with them.
        renderer.shadowMap.needsUpdate = true
        for (const piece of flung) {
          piece.velocity.y -= FLING_GRAVITY * step
          piece.object.position.addScaledVector(piece.velocity, step)
          piece.object.rotateOnWorldAxis(piece.axis, piece.rate * step)

          // A piece is placed with its base on the board's face at y = 0, so
          // that is the floor — for as long as it is still over the board. One
          // thrown clear of it goes on falling, which is the point of a flick;
          // one merely shaken loose has nowhere to go and comes down where it
          // stood, instead of sinking through.
          const overBoard =
            Math.abs(piece.object.position.x) < BOARD_SIZE / 2 &&
            Math.abs(piece.object.position.z) < BOARD_SIZE / 2
          if (overBoard && piece.object.position.y <= 0) {
            piece.object.position.y = 0
            piece.velocity.set(
              piece.velocity.x * LANDED_DAMPING,
              0,
              piece.velocity.z * LANDED_DAMPING,
            )
            piece.rate *= LANDED_DAMPING
          }
        }
        if (time - flungAt > FLING_SETTLE_MS) {
          flung = null
          setRestoreToken((token) => token + 1)
        }
      }
      if (animation) {
        // Pieces are moving, so the shadows have to follow them.
        renderer.shadowMap.needsUpdate = true
        const progress = Math.min(1, (time - animation.started) / animation.duration)
        const eased = 1 - (1 - progress) ** 3
        if (animation.attacker) animation.attacker.position.lerpVectors(animation.from, animation.to, eased)
        if (animation.victim) animation.victim.scale.setScalar(Math.max(0.001, 1 - eased))
      }
      renderer.render(scene, camera)
      positionLabels()
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
      renderer.dispose()
      canvas.remove()
      sceneRef.current = null
    }
  }, [props.orientation])

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
        for (const part of current.boardParts) part.visible = true
        current.renderer.shadowMap.needsUpdate = true
        current.invalidate()
        setLoading(false)
      },
      () => {
        // Better an untextured board than none at all.
        for (const part of current.boardParts) part.visible = true
        current.invalidate()
        setLoading(false)
      },
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
          // A spent miniature greys out as one authored object. Side ownership
          // now lives on its floating marker rather than on a synthetic base.
          if (piece.moved) {
            object.traverse((child) => {
              if (!(child instanceof THREE.Mesh)) return
              const materials = Array.isArray(child.material) ? child.material : [child.material]
              for (const material of materials) markSpent(material)
            })
          }
          object.userData.cell = cell
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
        current.renderer.shadowMap.needsUpdate = true
        current.invalidate()
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
        if (syncId !== syncIdRef.current) return
        current.renderer.shadowMap.needsUpdate = true
        current.invalidate()
        setLoading(false)
      })
    }
  }, [props.anim, props.board, restoreToken, threePieceStyle])

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
      current.invalidate()
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
        color = SELECT_HEX
        opacity = 0.45
      } else if (captureTargets.has(cell)) {
        color = CAPTURE_HEX
        opacity = 0.42
      } else if (props.legalTargets.includes(cell)) {
        color = MOVE_HEX
        opacity = 0.34
      }
      // Placement targets are deliberately not tinted: during the draft every
      // empty square is one, so marking them all says nothing.
      material.color.setHex(color)
      material.opacity = opacity
      current.highlights[cell].visible = opacity > 0
    }
  }, [props.legalTargets, props.selected, props.selectedMoves])

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
          move.capture ? CAPTURE_HEX : MOVE_HEX,
        )
      }
    } else if (arrowFrom != null && props.previewKind) {
      const previewColor = OWNER_COLOR[props.previewOwner]
      const previewHex = OWNER_HEX[props.previewOwner]
      for (const arrow of edgeArrows(arrowFrom, props.previewKind, previewColor)) {
        const from = cellPosition(arrowFrom)
        const to = from
          .clone()
          .add(new THREE.Vector3(arrow.dc * arrow.len * CELL_SIZE, 0, arrow.dr * arrow.len * CELL_SIZE))
        addArrow(current.arrowRoot, from, to, previewHex)
      }
    }
    // Hovering shows how a piece moves, in its owner's colour. Held back while
    // a selection or draft ghost owns the arrows, so the two never overlap.
    const hovered = hoverCell != null ? props.board[hoverCell] : null
    if (hovered && props.selected == null && props.previewCell == null && hoverCell != null) {
      const color = OWNER_HEX[hovered.color]
      for (const arrow of edgeArrows(hoverCell, hovered.kind, OWNER_COLOR[hovered.color])) {
        const from = cellPosition(hoverCell)
        const to = from
          .clone()
          .add(new THREE.Vector3(arrow.dc * arrow.len * CELL_SIZE, 0, arrow.dr * arrow.len * CELL_SIZE))
        addArrow(current.arrowRoot, from, to, color)
      }
    }

    const anim = props.anim
    if (anim && isArcher(anim.attacker) && anim.kind === 'capture') {
      addArrow(current.arrowRoot, cellPosition(anim.from), cellPosition(anim.to), ARCHER_SHOT_HEX)
    }
  }, [
    hoverCell,
    props.anim,
    props.board,
    props.previewCell,
    props.previewKind,
    props.previewOwner,
    props.selected,
    props.selectedMoves,
  ])


  return (
    <div ref={hostRef} className="three-board-shell" aria-label={t('board.threeView')}>
      {loading && <div className="three-board__loading">{t('board.loading3d')}</div>}

      {/* Labels ride above the canvas as HTML so the move badge is literally the
          same component the 2D board draws. The render loop positions them. */}
      <div className="three-board__labels" aria-hidden>
        {props.board.map((piece, cell) =>
          piece ? (
            <div
              key={cell}
              className={`three-label three-label--badge three-label--${piece.color}`}
              ref={(el) => {
                if (el) badgeRefs.current.set(cell, el)
                else badgeRefs.current.delete(cell)
              }}
            >
              <PieceBadge kind={piece.kind} roseSize={16} name={pieceName(piece.kind, t)} />
            </div>
          ) : null,
        )}
      </div>
    </div>
  )
}
