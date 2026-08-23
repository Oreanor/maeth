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
