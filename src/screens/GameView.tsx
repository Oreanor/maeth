import { useEffect, useState } from 'react'
import { AppHeader } from '@/components/AppHeader'
import { AppStage } from '@/components/AppStage'
import { GameBoard } from '@/components/GameBoard'
import { GameLog } from '@/components/GameLog'
import { ResultModal } from '@/components/ResultModal'
import { RulesModal } from '@/components/RulesModal'
import { Scoreboard } from '@/components/Scoreboard'
import { StatsModal } from '@/components/StatsModal'
import {
  GameCeremonyControls,
  type CeremonyHint,
} from '@/components/GameCeremonyControls'
import type { LogColor, LogEntry } from '@/game/actionLog'
import type { DraftPick, DuelEvent } from '@/game/useGame'
import type { PieceDef } from '@/game/pieces'
import type { AnimInfo } from '@/game/presentation'
import type { Color, GameState, LotteryState, Move } from '@/game/types'
import type { Presence } from '@/lib/api'
import { useI18n } from '@/i18n'

function ceremonyHintLine(hint: CeremonyHint, t: (key: string) => string): string | null {
  if (hint === 'stop-die') return t('game.stopDie')
  if (hint === 'wait-die') return t('game.opponentRolling')
  if (hint === 'stop-piece') return t('game.stopPiece')
  if (hint === 'wait-piece') return t('game.opponentChoosingPiece')
  return null
}

export interface GameViewProps {
  userName?: string
  onLogout: () => void

  state: GameState
  human: Color
  opponentColor: Color
  opponentName: string
  youName: string
  opponentPresence?: Presence | null
  error?: string | null

  logEntries: LogEntry[]
  logStatus: string | null
  logStatusColor: LogColor | null

  selected: number | null
  legalTargets: number[]
  selectedMoves: Move[]
  placementTargets: number[]
  movableCells: number[]
  previewCell: number | null
  pendingDef: PieceDef | null
  lastPlaced?: number | null
  anim: AnimInfo | null
  /** False while a ceremony, animation or the opponent's turn owns the board. */
  interactive: boolean
  onCell: (cell: number) => void
  onCellEnter: (cell: number) => void
  clearPreview: () => void

  showLottery: boolean
  lottery: LotteryState | null
  canRollLottery: boolean
  canStartLottery: boolean
  lotteryBusy: boolean
  onRollLottery: () => void
  onStartLottery: () => void
  draftPick: DraftPick | null
  onConfirmDraftPick: () => void
  duel: DuelEvent | null
  duelPending: boolean
  onDismissDuel: () => void

  /** True while a duel or move animation should hold the result modal back. */
  resultBlocked: boolean
  onAgain: () => void
  againBusy?: boolean
}

/**
 * The game HUD, shared by the local and the online screen. Both drive the same
 * layout from their own hook, so this owns the tree and the purely presentational
 * state (rules/stats panels, ceremony hint, "viewing the board" after a result)
 * and leaves each screen to supply the data.
 */
export function GameView({
  userName,
  onLogout,
  state,
  human,
  opponentColor,
  opponentName,
  youName,
  opponentPresence,
  error,
  logEntries,
  logStatus,
  logStatusColor,
  selected,
  legalTargets,
  selectedMoves,
  placementTargets,
  movableCells,
  previewCell,
  pendingDef,
  lastPlaced,
  anim,
  interactive,
  onCell,
  onCellEnter,
  clearPreview,
  showLottery,
  lottery,
  canRollLottery,
  canStartLottery,
  lotteryBusy,
  onRollLottery,
  onStartLottery,
  draftPick,
  onConfirmDraftPick,
  duel,
  duelPending,
  onDismissDuel,
  resultBlocked,
  onAgain,
  againBusy,
}: GameViewProps) {
  const { t } = useI18n()
  const [rulesOpen, setRulesOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [ceremonyHint, setCeremonyHint] = useState<CeremonyHint>(null)
  // The result modal can be dismissed to inspect the final board; it returns
  // when a new game ends.
  const [resultClosed, setResultClosed] = useState(false)
  useEffect(() => {
    if (state.phase !== 'over') setResultClosed(false)
  }, [state.phase])

  const over = state.phase === 'over' && !resultBlocked
  const showResult = over && !resultClosed
  const showPlayAgain = over && resultClosed
  const ceremonyStatus = ceremonyHintLine(ceremonyHint, t)

  return (
    <AppStage>
      <AppHeader
        name={userName}
        onHelp={() => setRulesOpen(true)}
        onStats={() => setStatsOpen(true)}
        onLogout={onLogout}
        className="game-topbar"
      />

      {error && <p className="muted tiny">{error}</p>}

      <Scoreboard
        state={state}
        human={human}
        bot={opponentColor}
        opponentName={opponentName}
        youName={youName}
        opponentPresence={opponentPresence}
      />

      <GameLog
        entries={logEntries}
        statusLine={showPlayAgain ? null : (ceremonyStatus ?? logStatus)}
        statusColor={showPlayAgain ? null : logStatusColor}
        statusAction={
          showPlayAgain
            ? { label: t('result.again'), onClick: onAgain, disabled: againBusy }
            : undefined
        }
      />

      <GameBoard
        board={state.board}
        selected={selected}
        legalTargets={legalTargets}
        selectedMoves={selectedMoves}
        placementTargets={pendingDef ? placementTargets : []}
        lastPlaced={state.phase === 'draft' ? (lastPlaced ?? null) : null}
        movable={interactive ? movableCells : []}
        previewCell={previewCell}
        previewKind={previewCell != null && pendingDef ? pendingDef.kind : null}
        previewOwner={human}
        orientation={human}
        anim={anim}
        onCellClick={onCell}
        onCellEnter={onCellEnter}
        onBoardLeave={clearPreview}
        interactive={interactive}
      />

      <GameCeremonyControls
        human={human}
        lottery={showLottery ? lottery : null}
        canRollLottery={canRollLottery}
        canStartLottery={canStartLottery}
        lotteryBusy={lotteryBusy}
        onRollLottery={onRollLottery}
        onStartLottery={onStartLottery}
        draftPick={draftPick}
        onConfirmDraftPick={onConfirmDraftPick}
        duel={duel}
        duelPending={duelPending}
        onDismissDuel={onDismissDuel}
        onHintChange={setCeremonyHint}
      />

      {showResult && (
        <ResultModal
          status={state.status}
          human={human}
          onAgain={onAgain}
          againBusy={againBusy}
          onClose={() => setResultClosed(true)}
        />
      )}

      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
      {statsOpen && <StatsModal onClose={() => setStatsOpen(false)} />}
    </AppStage>
  )
}
