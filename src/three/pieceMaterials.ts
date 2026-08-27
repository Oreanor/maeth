import * as THREE from 'three'

// Everything that decides how a piece is shaded: the lacquer over the GLB's own
// textures, and the treatment for a piece that has already moved. Kept out of
// ThreeBoard, which is about the scene, in the same way piece loading is.
//
// Both sets arrive fully textured, so there is nothing here that invents a
// finish. The procedural marble, wood, bone and metal that used to live in this
// file were dropped along with the material picker.

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

/**
 * Grey out a piece that has already moved this turn.
 *
 * A piece's colour comes from the model's texture, so tinting the material
 * cannot desaturate it — the mix has to happen after shading, which is what
 * this patch does.
 */
export function markSpent(material: THREE.Material) {
  // Re-installs the painted patch in its spent form rather than adding a second
  // one, which would replace the saturation instead of joining it.
  applyPaintedFinish(material, true)
}
