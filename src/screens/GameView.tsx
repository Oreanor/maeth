import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppHeader } from '@/components/AppHeader'
import { AppStage } from '@/components/AppStage'
import { GameBoard } from '@/components/GameBoard'
import { GameLog } from '@/components/GameLog'
import { PieceChatBar } from '@/components/PieceChat'
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
import { useBoardView } from '@/boardView'
import { opposite as opponentOf } from '@/game/types'
import { preloadPieceModel } from '@/three/preload'
import { usePieceChat } from '@/chat/usePieceChat'
import { useChatter } from '@/chat/useChatter'

function ceremonyHintLine(hint: CeremonyHint, t: (key: string) => string): string | null {
  if (hint === 'coin-lottery') return t('lottery.coinSpinning')
  if (hint === 'coin-duel') return t('duel.coinSpinning')
  if (hint === 'stop-piece') return t('game.stopPiece')
  if (hint === 'wait-piece') return t('game.opponentChoosingPiece')
  return null
}

export interface GameViewProps {
  userName?: string
  onLogout: () => void
  onSignIn: () => void

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
  onSignIn,
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
  const navigate = useNavigate()
  const { viewMode, threePieceStyle } = useBoardView()
  const [rulesOpen, setRulesOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [ceremonyHint, setCeremonyHint] = useState<CeremonyHint>(null)
  // The result modal can be dismissed to inspect the final board; it returns
  // when a new game ends.
  const [resultClosed, setResultClosed] = useState(false)
  useEffect(() => {
    if (state.phase !== 'over') setResultClosed(false)
  }, [state.phase])

  // A drawn piece is settled before its carousel starts spinning, so the GLB
  // can be on the wire while the reveal plays instead of after it lands.
  const drawn = state.pending
  useEffect(() => {
    if (viewMode === '3d' && drawn != null) preloadPieceModel(drawn, threePieceStyle)
  }, [viewMode, drawn, threePieceStyle])

  const over = state.phase === 'over' && !resultBlocked
  const showResult = over && !resultClosed
  const showPlayAgain = over && resultClosed
  // The pieces read the same play-by-play the player does, so they know who
  // struck down whom without a second record being kept for them.
  const logLines = useMemo(() => logEntries.map((entry) => entry.text), [logEntries])
  // An order from the player is played the way their own hands would play it:
  // pick the piece up, then put it down. Two clicks rather than a private path
  // into the engine, so every guard the board already has still applies — and
  // the second one waits a frame, because the first has to land in state first.
  const onCellRef = useRef(onCell)
  onCellRef.current = onCell
  const onOrder = useCallback((from: number, to: number) => {
    onCellRef.current(from)
    requestAnimationFrame(() => requestAnimationFrame(() => onCellRef.current(to)))
  }, [])

  const chat = usePieceChat({ state, human, youName, opponentName, gameLog: logLines, onOrder })
  // The board mutters to itself between moves — but not over the top of a
  // conversation the player started.
  const ambient = useChatter({
    state,
    human,
    youName,
    busy: chat.cell != null,
    enabled: chat.available,
  })

  const firstTurn =
    showLottery && lottery?.step === 'revealed' ? (lottery.firstTurn ?? null) : null
  const firstLine =
    firstTurn == null
      ? null
      : firstTurn === human
        ? t('lottery.firstYou')
        : t('lottery.firstThem', { name: opponentName })

  // The strike is the same ceremony: the coin comes down, and the line says
  // whether the blow went home. Its colour belongs to whoever won the exchange.
  const duelWinner = duel == null ? null : duel.success ? duel.by : opponentOf(duel.by)
  const duelLine =
    duel == null
      ? null
      : duel.success
        ? t('duel.hit')
        : t('duel.blocked')

  const ceremonyStatus = ceremonyHintLine(ceremonyHint, t)
  const selectionStatus =
    state.phase === 'play' && interactive && selected != null
      ? t('game.chooseMoveOrPiece')
      : null

  return (
    <AppStage>
      {/* The same menu the lobby shows, and on the same terms: whoever is not
          signed in is offered the way in rather than a logout and a stats table
          with nothing of theirs in it. A guest reaches the board without ever
          passing the lobby — the pieces will talk to them either way — so the
          offer has to be here too. */}
      <AppHeader
        name={userName}
        onHelp={() => setRulesOpen(true)}
        onStats={userName ? () => setStatsOpen(true) : undefined}
        onSignIn={userName ? undefined : onSignIn}
        onLogout={
          userName
            ? () => {
                onLogout()
                // Back to the start screen. The online routes would bounce
                // there on their own once the account goes, but a local game
                // against the bot is not guarded and would otherwise carry on
                // underneath.
                navigate('/')
              }
            : undefined
        }
        onExit={() => navigate('/')}
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
        statusLine={
          showPlayAgain
            ? null
            : (duelLine ?? firstLine ?? ceremonyStatus ?? selectionStatus ?? logStatus)
        }
        statusColor={showPlayAgain ? null : (duelWinner ?? firstTurn ?? logStatusColor)}
        statusAction={
          showPlayAgain
            ? { label: t('result.again'), onClick: onAgain, disabled: againBusy }
            : undefined
        }
      />

      <PieceChatBar chat={chat} />

      <GameLog entries={logEntries} />

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
        claimedBy={duelWinner ?? firstTurn}
        chat={chat}
        ambient={ambient}
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
