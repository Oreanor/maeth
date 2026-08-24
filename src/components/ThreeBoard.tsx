import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { BOARD_STYLE_CONFIG, useBoardView, type ThreePieceStyle } from '@/boardView'
import { useI18n } from '@/i18n'
import { isArcher, pieceName, type PieceKind } from '@/game/pieces'
import { colOf, opposite, rowOf, type Color } from '@/game/types'
import { sourceModel } from '@/three/pieceModels'
import { OWNER_COLOR, edgeArrows } from './ArrowOverlay'
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
const TOP_Y = BOARD_THICKNESS / 2 + 0.026
// Sink the authored pedestal by only a hair, hiding floating-point gaps without
// burying its lower moulding in the board.
const PIECE_SINK_RATIO = 0.003
const BOARD_EDGE_DARKEN = 0.56

/** Per-model visual corrections after normalising GLB bounds. */
const MODEL_SCALE: Partial<Record<PieceKind, number>> = {
  rohanWarrior: 1.5,
  balrog: 1.5,
  shelob: 1.5,
  ent: 1.4,
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

type ChessMaterialStyle = Exclude<ThreePieceStyle, 'painted'>
type ProceduralTextureStyle = Exclude<ChessMaterialStyle, 'classic'>

interface ChessMaterialPreset {
  light: number
  dark: number
  roughness: number
  metalness: number
  clearcoat: number
  clearcoatRoughness: number
  texture?: ProceduralTextureStyle
}

const CHESS_MATERIALS: Record<ChessMaterialStyle, ChessMaterialPreset> = {
  classic: {
    light: 0xd0b583,
    dark: 0xd0b583,
    roughness: 0.72,
    metalness: 0.02,
    clearcoat: 0,
    clearcoatRoughness: 1,
  },
  wood: {
    light: 0xd2a36a,
    dark: 0x9a6843,
    roughness: 0.84,
    metalness: 0,
    clearcoat: 0.025,
    clearcoatRoughness: 0.94,
    texture: 'wood',
  },
  stone: {
    light: 0xbdbab2,
    dark: 0x287a59,
    roughness: 0.34,
    metalness: 0,
    clearcoat: 0.42,
    clearcoatRoughness: 0.2,
    texture: 'stone',
  },
  bone: {
    light: 0xdfcca2,
    dark: 0x9b784d,
    roughness: 0.5,
    metalness: 0,
    clearcoat: 0.2,
    clearcoatRoughness: 0.68,
    texture: 'bone',
  },
  metal: {
    light: 0xd8dde1,
    dark: 0xb8892e,
    roughness: 0.3,
    metalness: 0.88,
    clearcoat: 0.28,
    clearcoatRoughness: 0.42,
    texture: 'metal',
  },
}

/** Procedural patterns use world position, so they remain visible even on GLBs
 * with missing, tiny or inconsistent UV islands. No alternate model textures
 * are stored or uploaded. */
function applyProceduralMaterial(
  material: THREE.MeshPhysicalMaterial,
  style: ProceduralTextureStyle,
  color: Color,
) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPieceWorldPosition;')
      .replace(
        '#include <fog_vertex>',
        'vPieceWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <fog_vertex>',
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vPieceWorldPosition;
float pieceHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float pieceNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(pieceHash(i), pieceHash(i + vec3(1, 0, 0)), f.x),
        mix(pieceHash(i + vec3(0, 1, 0)), pieceHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(pieceHash(i + vec3(0, 0, 1)), pieceHash(i + vec3(1, 0, 1)), f.x),
        mix(pieceHash(i + vec3(0, 1, 1)), pieceHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float piecePattern = 0.5;`,
      )

    const stonePattern = color === 'white' ? `
vec3 pieceP = vPieceWorldPosition;
float pieceCloud = pieceNoise(pieceP * 7.0) * 0.7 + pieceNoise(pieceP * 19.0) * 0.3;
float pieceVeinA = 1.0 - smoothstep(0.035, 0.18, abs(sin((pieceP.x + pieceP.z * 0.68 + pieceCloud * 0.5) * 11.0)));
float pieceVeinB = 1.0 - smoothstep(0.025, 0.12, abs(sin((pieceP.x * 0.34 - pieceP.z + pieceCloud * 0.35) * 16.0)));
float pieceVein = max(pieceVeinA, pieceVeinB * 0.58);
piecePattern = clamp(0.76 + pieceCloud * 0.2 - pieceVein * 0.82, 0.0, 1.0);
diffuseColor.rgb *= mix(vec3(0.3, 0.34, 0.4), vec3(1.06, 1.05, 1.02), piecePattern);` : `
vec3 pieceP = vPieceWorldPosition;
float pieceCloud = pieceNoise(pieceP * 5.5);
float pieceFlow = pieceP.x * 0.7 + pieceP.z * 0.48 + pieceP.y * 0.16 + pieceCloud * 0.48;
float pieceBandA = 0.5 + 0.5 * sin(pieceFlow * 23.0);
float pieceBandB = 0.5 + 0.5 * sin(pieceFlow * 47.0 + pieceNoise(pieceP * 14.0) * 4.0);
piecePattern = clamp(pieceBandA * 0.72 + pieceBandB * 0.2 + pieceCloud * 0.08, 0.0, 1.0);
diffuseColor.rgb *= mix(vec3(0.2, 0.48, 0.3), vec3(1.24, 1.12, 0.76), piecePattern);`

    const pattern = {
      wood: `
vec3 pieceP = vPieceWorldPosition;
float pieceWarp = pieceNoise(pieceP * vec3(4.2, 1.15, 4.2));
float pieceSlow = pieceNoise(pieceP * vec3(2.7, 1.3, 2.7));
float pieceDetail = pieceNoise(pieceP * vec3(11.0, 4.0, 11.0));
float pieceFineLine = pow(0.5 + 0.5 * sin(pieceP.y * 39.0 + pieceP.x * 5.0 + pieceWarp * 13.0), 22.0);
piecePattern = clamp(0.45 + pieceSlow * 0.42 + pieceDetail * 0.13 - pieceFineLine * 0.12, 0.0, 1.0);
vec3 pieceWoodTint = mix(vec3(0.7, 0.61, 0.5), vec3(1.16, 1.08, 0.94), piecePattern);
diffuseColor.rgb *= pieceWoodTint;`,
      stone: stonePattern,
      bone: `
vec3 pieceP = vPieceWorldPosition;
float pieceCloud = pieceNoise(pieceP * 8.0);
float pieceLayers = 0.5 + 0.5 * sin(pieceP.y * 21.0 + pieceCloud * 5.0);
float piecePores = smoothstep(0.72, 0.88, pieceNoise(pieceP * 42.0));
piecePattern = clamp(0.48 + pieceCloud * 0.25 + pieceLayers * 0.22 - piecePores * 0.5, 0.0, 1.0);
diffuseColor.rgb *= mix(vec3(0.56, 0.49, 0.39), vec3(1.14, 1.1, 0.98), piecePattern);`,
      metal: `
vec3 pieceP = vPieceWorldPosition;
float pieceBrush = 0.5 + 0.5 * sin(pieceP.y * 190.0 + pieceNoise(pieceP * 25.0) * 3.0);
piecePattern = pieceBrush;
diffuseColor.rgb *= mix(0.82, 1.12, piecePattern);`,
    }[style]

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>\n${pattern}`)
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + (0.5 - piecePattern) * 0.16, 0.08, 1.0);',
      )
  }
  material.customProgramCacheKey = () => `maeth-piece-${style}-${color}-v3`
}

function chessMaterial(style: ChessMaterialStyle, color: Color): THREE.MeshPhysicalMaterial {
  const preset = CHESS_MATERIALS[style]
  const baseColor = new THREE.Color(color === 'white' ? preset.light : preset.dark)
  const isMalachite = style === 'stone' && color === 'black'
  const material = new THREE.MeshPhysicalMaterial({
    color: baseColor,
    emissive: baseColor.clone().multiplyScalar(style === 'metal' ? 0.025 : 0.06),
    emissiveIntensity: style === 'metal' ? 0.05 : 0.07,
    roughness: isMalachite ? 0.27 : preset.roughness,
    metalness: preset.metalness,
    clearcoat: isMalachite ? 0.52 : preset.clearcoat,
    clearcoatRoughness: isMalachite ? 0.14 : preset.clearcoatRoughness,
  })
  if (preset.texture) applyProceduralMaterial(material, preset.texture, color)
  return material
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

  // Textured pieces used to be lifted with an emissive pass over the same map,
  // which cost a second texture fetch on every pixel they cover. The lights
  // below carry that brightness now.
  if (!material.map && material.emissiveIntensity === 0) {
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
          style === 'painted' ? cloneMaterial(material) : chessMaterial(style, color),
        )
      : style === 'painted'
        ? cloneMaterial(object.material)
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
    TOP_Y - bounds.min.y * scale - sink,
    -center.z * scale,
  )

  const group = new THREE.Group()
  group.rotation.y = color === 'white' ? 0 : Math.PI
  group.add(model)
  // Height of the sculpted figure above the board, so the overlay can park a
  // label just clear of its crown rather than at a guessed fixed height.
  group.userData.topY = TOP_Y + size.y * scale - sink
  return group
}

/** How far a spent piece is pushed toward grey, and how far an untextured one
 *  is dimmed instead. */
const SPENT_GREY = 1
const SPENT_DIM = 0.55

/**
 * Grey out a piece that has already moved this turn.
 *
 * Its colour comes from the model's texture, so tinting the material cannot
 * desaturate it — the mix has to happen after shading, which is what this patch
 * does. Bails out rather than producing a broken shader if the anchor chunk
 * ever moves.
 */
function markSpent(material: THREE.Material) {
  // The classic set is carved from one cream tone, so draining its colour reads
  // as "a piece of the other side" rather than "already moved". Dim it instead,
  // which it can afford because its colour is the material's, not a texture's.
  if (material instanceof THREE.MeshStandardMaterial && !material.map) {
    material.color.multiplyScalar(SPENT_DIM)
    material.emissiveIntensity *= SPENT_DIM
    return
  }
  material.onBeforeCompile = (shader) => {
    const anchor = '#include <dithering_fragment>'
    if (!shader.fragmentShader.includes(anchor)) return
    shader.fragmentShader = shader.fragmentShader.replace(
      anchor,
      `${anchor}
      float spentLuma = dot( gl_FragColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
      gl_FragColor.rgb = mix( gl_FragColor.rgb, vec3( spentLuma ), ${SPENT_GREY.toFixed(2)} );`,
    )
  }
  // three keys its program cache on material properties, which say nothing about
  // onBeforeCompile — without a key of its own a spent piece would be handed the
  // program compiled for a fresh one.
  material.customProgramCacheKey = () => 'spent'
  material.needsUpdate = true
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
  const nameRef = useRef<HTMLDivElement>(null)
  const hoverRef = useRef<number | null>(null)
  const { boardStyle, threePieceStyle } = useBoardView()
  const { t } = useI18n()
  const [loading, setLoading] = useState(true)
  const [hoverCell, setHoverCell] = useState<number | null>(null)

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

      const name = nameRef.current
      let named = false
      const placed = new Set<number>()
      for (const piece of pieceRoot.children) {
        const cell = piece.userData.cell
        if (typeof cell !== 'number') continue
        placed.add(cell)
        const top = (piece.userData.topY as number | undefined) ?? 1
        const badge = badgeRefs.current.get(cell)
        if (badge) placeLabel(badge, piece.position.x, top, piece.position.z, 0.12)
        if (name && cell === hoverRef.current) {
          placeLabel(name, piece.position.x, top, piece.position.z, 0.52)
          named = true
        }
      }
      for (const [cell, badge] of badgeRefs.current) {
        if (!placed.has(cell)) badge.style.opacity = '0'
      }
      if (name && !named) name.style.opacity = '0'
    }

    // Nothing on this board moves by itself, so the loop draws only while the
    // camera is moving, a piece is animating, or something asked it to. A canvas
    // that is dirty every frame is not only its own cost: the browser has to
    // recomposite it and recompute any blurred backdrop above it just as often.
    let dirtyFrames = 2
    threeScene.invalidate = () => {
      dirtyFrames = 2
    }

    const render = (time: number) => {
      threeScene.frame = requestAnimationFrame(render)
      const moving = controls.update()
      const animation = threeScene.animation
      if (!moving && !animation) {
        if (dirtyFrames <= 0) return
        dirtyFrames -= 1
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
        current.renderer.shadowMap.needsUpdate = true
        current.invalidate()
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
        color = 0xf6c945
        opacity = 0.45
      } else if (captureTargets.has(cell)) {
        color = 0xe23b34
        opacity = 0.42
      } else if (props.legalTargets.includes(cell)) {
        color = 0x3fae5a
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
    // Hovering shows how a piece moves, in its owner's colour. Held back while
    // a selection or draft ghost owns the arrows, so the two never overlap.
    const hovered = hoverCell != null ? props.board[hoverCell] : null
    if (hovered && props.selected == null && props.previewCell == null && hoverCell != null) {
      const color = new THREE.Color(OWNER_COLOR[hovered.color]).getHex()
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
      addArrow(current.arrowRoot, cellPosition(anim.from), cellPosition(anim.to), 0xf0b84b)
    }
  }, [
    hoverCell,
    props.anim,
    props.board,
    props.previewCell,
    props.previewKind,
    props.selected,
    props.selectedMoves,
  ])

  const hoveredPiece = hoverCell != null ? props.board[hoverCell] : null

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
              <PieceBadge kind={piece.kind} roseSize={16} />
            </div>
          ) : null,
        )}
        <div ref={nameRef} className="three-label three-label--name">
          {hoveredPiece ? pieceName(hoveredPiece.kind, t) : ''}
        </div>
      </div>
    </div>
  )
}
