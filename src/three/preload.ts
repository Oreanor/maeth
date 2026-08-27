import type { ThreePieceStyle } from '@/boardView'
import type { PieceKind } from '@/game/pieces'

/**
 * Start fetching a piece's GLB before the board needs it — the draft carousel
 * spins for a beat on a piece that is already decided, which is exactly long
 * enough to cover the download.
 *
 * Deliberately reaches `pieceModels` through a dynamic import: that module
 * pulls in three.js, which belongs to the lazily loaded 3D chunk and must stay
 * out of the initial bundle.
 *
 * Fire-and-forget. The result is cached for the real load, and a failure is
 * swallowed — the board requests the model again and surfaces errors itself.
 */
export function preloadPieceModel(kind: PieceKind, set: ThreePieceStyle): void {
  void import('./pieceModels')
    .then((module) => module.sourceModel(kind, set))
    .catch(() => {})
}
