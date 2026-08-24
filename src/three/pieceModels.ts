import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { PieceKind } from '@/game/pieces'

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

const gltfLoader = new GLTFLoader()
const modelCache = new Map<PieceKind, Promise<THREE.Object3D>>()

/**
 * The source GLBs contain a pedestal as the only disconnected geometry island
 * touching the model's lowest Y. Remove that island once from the cached
 * geometry, preserving the authored figure, UVs and material.
 */
/** Pedestal thresholds, as fractions of the model's own size. */
const MAX_BASE_HEIGHT = 0.22
const MAX_PEDESTAL_THICKNESS = 0.12
const MIN_PEDESTAL_WIDTH = 0.6

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

  // Per-island extents, so a pedestal can be told apart from the figure.
  interface Island {
    minY: number
    maxY: number
    minX: number
    maxX: number
    minZ: number
    maxZ: number
  }
  const byRoot = new Map<number, Island>()
  let modelMinX = Infinity
  let modelMaxX = -Infinity
  let modelMinZ = Infinity
  let modelMaxZ = -Infinity
  for (let vertex = 0; vertex < position.count; vertex++) {
    const x = position.getX(vertex)
    const y = position.getY(vertex)
    const z = position.getZ(vertex)
    modelMinX = Math.min(modelMinX, x)
    modelMaxX = Math.max(modelMaxX, x)
    modelMinZ = Math.min(modelMinZ, z)
    modelMaxZ = Math.max(modelMaxZ, z)
    const root = find(vertex)
    const island = byRoot.get(root)
    if (!island) {
      byRoot.set(root, { minY: y, maxY: y, minX: x, maxX: x, minZ: z, maxZ: z })
      continue
    }
    island.minY = Math.min(island.minY, y)
    island.maxY = Math.max(island.maxY, y)
    island.minX = Math.min(island.minX, x)
    island.maxX = Math.max(island.maxX, x)
    island.minZ = Math.min(island.minZ, z)
    island.maxZ = Math.max(island.maxZ, z)
  }

  const modelHeight = globalMaxY - globalMinY
  const modelSpan = Math.max(modelMaxX - modelMinX, modelMaxZ - modelMinZ)
  if (modelHeight <= 0 || modelSpan <= 0) return

  const seedRoot = find(lowestVertex)
  const seed = byRoot.get(seedRoot)
  if (!seed) return
  if ((seed.maxY - globalMinY) / modelHeight > MAX_BASE_HEIGHT) return

  // Some models stack a second disc on the pedestal, or ring it with one — the
  // lowest island alone then leaves that debris behind. A pedestal piece is the
  // one thing down here that is both flat and nearly as wide as the model: the
  // figure's own low parts (roots, legs, a dragged wing) are narrow, and what is
  // wide down there (a tree trunk) is tall. Applied in a single pass against the
  // seed's top — growing the zone island by island would let foliage chain all
  // the way up a tree.
  const baseRoots = new Set<number>([seedRoot])
  for (const [root, island] of byRoot) {
    if (root === seedRoot) continue
    if (island.minY > seed.maxY) continue
    if ((island.maxY - island.minY) / modelHeight > MAX_PEDESTAL_THICKNESS) continue
    const span = Math.max(island.maxX - island.minX, island.maxZ - island.minZ)
    if (span / modelSpan < MIN_PEDESTAL_WIDTH) continue
    if ((island.maxY - globalMinY) / modelHeight > MAX_BASE_HEIGHT) continue
    baseRoots.add(root)
  }

  let bodyMinY = Infinity
  let bodyX = 0
  let bodyZ = 0
  let bodyVertices = 0
  for (let vertex = 0; vertex < position.count; vertex++) {
    if (baseRoots.has(find(vertex))) continue
    bodyMinY = Math.min(bodyMinY, position.getY(vertex))
    bodyX += position.getX(vertex)
    bodyZ += position.getZ(vertex)
    bodyVertices += 1
  }
  if (!bodyVertices) return

  const retainedIndices: number[] = []
  for (let offset = 0; offset < index.count; offset += 3) {
    const a = index.getX(offset)
    if (baseRoots.has(find(a))) continue
    retainedIndices.push(a, index.getX(offset + 1), index.getX(offset + 2))
  }
  if (retainedIndices.length === index.count) return

  // Unreferenced base vertices remain in the attribute buffer. Collapse them
  // inside the body bounds so bounding-box-based scaling ignores the old base.
  const collapsedX = bodyX / bodyVertices
  const collapsedZ = bodyZ / bodyVertices
  for (let vertex = 0; vertex < position.count; vertex++) {
    if (baseRoots.has(find(vertex))) position.setXYZ(vertex, collapsedX, bodyMinY, collapsedZ)
  }
  position.needsUpdate = true
  geometry.setIndex(retainedIndices)
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  geometry.userData.embeddedBaseRemoved = true
}

/**
 * The parsed, base-stripped source scene for a kind, loaded once and shared.
 * Callers clone it — never mutate what comes back.
 */
export function sourceModel(kind: PieceKind): Promise<THREE.Object3D> {
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
