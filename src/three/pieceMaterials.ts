import * as THREE from 'three'
import type { ThreePieceStyle } from '@/boardView'
import type { Color } from '@/game/types'

// Everything that decides how a piece is shaded: the chess sets' presets and
// procedural finishes, the tuning applied to the painted GLB materials, and the
// treatment for a piece that has already moved. Kept out of ThreeBoard, which
// is about the scene, in the same way piece loading is.

/** How far the painted sets are pushed away from grey. Above 1 saturates. */
const PAINTED_SATURATION = 1.22
/** The lacquer over them: a thin, fairly sharp coat, like a varnished figure. */
const PAINTED_CLEARCOAT = 0.55
const PAINTED_CLEARCOAT_ROUGHNESS = 0.26

/**
 * A painted piece, lacquered.
 *
 * The GLB ships a MeshStandardMaterial, which has no clearcoat, so the coat
 * means rebuilding it as a physical material. Its fields are copied across by
 * hand rather than with .copy(): copying a standard material into a physical
 * one leaves the physical-only fields reading from a source that has none.
 */
export function paintedMaterial(source: THREE.Material): THREE.Material {
  if (!(source instanceof THREE.MeshStandardMaterial)) return source.clone()
  return new THREE.MeshPhysicalMaterial({
    color: source.color.clone(),
    map: source.map,
    normalMap: source.normalMap,
    normalScale: source.normalScale.clone(),
    roughnessMap: source.roughnessMap,
    metalnessMap: source.metalnessMap,
    aoMap: source.aoMap,
    aoMapIntensity: source.aoMapIntensity,
    roughness: source.roughness,
    metalness: source.metalness,
    clearcoat: PAINTED_CLEARCOAT,
    clearcoatRoughness: PAINTED_CLEARCOAT_ROUGHNESS,
  })
}

/**
 * The fragment tweaks for a painted piece: richer colour, and grey once it has
 * moved.
 *
 * Both live in one patch on purpose. three keeps a single onBeforeCompile per
 * material, so installing a second silently replaces the first — saturating and
 * greying separately would mean whichever ran last was the only one that took.
 */
function applyPaintedFinish(material: THREE.Material, spent: boolean) {
  material.onBeforeCompile = (shader) => {
    const anchor = '#include <dithering_fragment>'
    if (!shader.fragmentShader.includes(anchor)) return
    const grey = 'dot( gl_FragColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) )'
    shader.fragmentShader = shader.fragmentShader.replace(
      anchor,
      `${anchor}
      float paintedLuma = ${grey};
      gl_FragColor.rgb = ${
        spent
          ? 'vec3( paintedLuma )'
          : `mix( vec3( paintedLuma ), gl_FragColor.rgb, ${PAINTED_SATURATION.toFixed(2)} )`
      };`,
    )
  }
  // three keys its program cache on material properties, which say nothing
  // about onBeforeCompile — without a key of its own the two variants would
  // share one compiled program.
  material.customProgramCacheKey = () => (spent ? 'painted-spent' : 'painted')
  material.needsUpdate = true
}

export type ChessMaterialStyle = Exclude<ThreePieceStyle, 'painted'>
type ProceduralTextureStyle = Exclude<ChessMaterialStyle, 'classic'>

interface ChessMaterialFinish {
  roughness: number
  metalness: number
  clearcoat: number
  clearcoatRoughness: number
}

interface ChessMaterialPreset extends ChessMaterialFinish {
  light: number
  dark: number
  texture?: ProceduralTextureStyle
  /** The dark side is a different material in some sets — malachite against
   *  marble, say — so it may override the finish rather than only the colour. */
  darkFinish?: Partial<ChessMaterialFinish>
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
    // Malachite: glassier and more sharply polished than the pale marble.
    darkFinish: { roughness: 0.27, clearcoat: 0.52, clearcoatRoughness: 0.14 },
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

export function chessMaterial(style: ChessMaterialStyle, color: Color): THREE.MeshPhysicalMaterial {
  const preset = CHESS_MATERIALS[style]
  const baseColor = new THREE.Color(color === 'white' ? preset.light : preset.dark)
  const finish: ChessMaterialFinish = {
    roughness: preset.roughness,
    metalness: preset.metalness,
    clearcoat: preset.clearcoat,
    clearcoatRoughness: preset.clearcoatRoughness,
    ...(color === 'black' ? preset.darkFinish : null),
  }
  const material = new THREE.MeshPhysicalMaterial({
    color: baseColor,
    emissive: baseColor.clone().multiplyScalar(style === 'metal' ? 0.025 : 0.06),
    emissiveIntensity: style === 'metal' ? 0.05 : 0.07,
    ...finish,
  })
  if (preset.texture) applyProceduralMaterial(material, preset.texture, color)
  return material
}

/** Lift detail out of the dark GLB textures without overexposing the board.
 * Ghosts stay depth-writing and opaque, so their outer shell hides internals. */
export function tunePieceMaterial(material: THREE.Material, ghost: boolean) {
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
  if (material.map) {
    applyPaintedFinish(material, false)
  } else if (material.emissiveIntensity === 0) {
    material.emissive.copy(material.color)
    material.emissiveIntensity = 0.16
  }
}

/** How far an untextured piece is dimmed once it has moved. A textured one is
 *  taken fully grey by applyPaintedFinish instead. */
const SPENT_DIM = 0.55

/**
 * Grey out a piece that has already moved this turn.
 *
 * Shares one slot with applyProceduralMaterial: both would assign
 * onBeforeCompile, and the second assignment wins silently. They never collide
 * today because the chess sets are untextured, so this takes the dimming branch
 * and returns before touching the shader — keep that true, or merge the two.
 *
 * Its colour comes from the model's texture, so tinting the material cannot
 * desaturate it — the mix has to happen after shading, which is what this patch
 * does. Bails out rather than producing a broken shader if the anchor chunk
 * ever moves.
 */
export function markSpent(material: THREE.Material) {
  // The classic set is carved from one cream tone, so draining its colour reads
  // as "a piece of the other side" rather than "already moved". Dim it instead,
  // which it can afford because its colour is the material's, not a texture's.
  if (material instanceof THREE.MeshStandardMaterial && !material.map) {
    material.color.multiplyScalar(SPENT_DIM)
    material.emissiveIntensity *= SPENT_DIM
    return
  }
  // Re-installs the painted patch in its spent form rather than adding a second
  // one, which would replace the saturation instead of joining it.
  applyPaintedFinish(material, true)
}
