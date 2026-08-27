import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { ThreePieceStyle } from '@/boardView'
import type { PieceKind } from '@/game/pieces'

/** Both sets carve the same cast under the same file names, so the set is only
 *  ever the folder. Keep it that way when a set is added: a per-set name map is
 *  a second thing to keep in step for no gain. */
const MODEL_FILE: Record<PieceKind, string> = {
  nazgul: 'nazgul.glb',
  tomBombadil: 'tom.glb',
  orcArcher: 'orc_archer.glb',
  gondorWarrior: 'gondor.glb',
  balrog: 'balrog.glb',
  wizard: 'mage.glb',
  elvenWarrior: 'elf_warrior.glb',
  king: 'king.glb',
  shelob: 'shelob.glb',
  ent: 'ent.glb',
  dwarf: 'dwarf.glb',
  farmer: 'farmer.glb',
  orcChief: 'orc_chief.glb',
  elvenQueen: 'elf_queen.glb',
  hobbit: 'hobbit.glb',
  rohanWarrior: 'rohan.glb',
}

const gltfLoader = new GLTFLoader()
const modelCache = new Map<string, Promise<THREE.Object3D>>()

/** The parsed, untouched GLB scene, including its authored pedestal. Cached per
 *  set as well as per piece: switching sets mid-game must not hand back the
 *  figure the other set had already loaded. */
export function sourceModel(kind: PieceKind, set: ThreePieceStyle): Promise<THREE.Object3D> {
  const url = `/models/${set}/${MODEL_FILE[kind]}`
  const cached = modelCache.get(url)
  if (cached) return cached
  const loading = gltfLoader.loadAsync(url).then((gltf) => gltf.scene)
  modelCache.set(url, loading)
  return loading
}
