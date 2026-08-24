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

/** The parsed, untouched GLB scene, including its authored pedestal. */
export function sourceModel(kind: PieceKind): Promise<THREE.Object3D> {
  const cached = modelCache.get(kind)
  if (cached) return cached
  const loading = gltfLoader.loadAsync(MODEL_URL[kind]).then((gltf) => gltf.scene)
  modelCache.set(kind, loading)
  return loading
}
