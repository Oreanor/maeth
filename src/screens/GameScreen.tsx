import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { GameBoard } from '@/components/GameBoard'
import { AppHeader } from '@/components/AppHeader'
import { AppStage } from '@/components/AppStage'
import { RulesModal } from '@/components/RulesModal'
import { StatsModal } from '@/components/StatsModal'
import { Scoreboard } from '@/components/Scoreboard'
import { GameLog } from '@/components/GameLog'
import { buildActionLog, type LogNames } from '@/game/actionLog'
import { gameLogStatusColor, gameLogStatusLine } from '@/game/logStatus'
import { ResultModal } from '@/components/ResultModal'
import {
  GameCeremonyControls,
  type CeremonyHint,
} from '@/components/GameCeremonyControls'
import { useGame } from '@/game/useGame'
import { pieceName } from '@/game/pieces'
import type { Color } from '@/game/types'
import { useAuth } from '@/auth/AuthContext'
import { useI18n } from '@/i18n'
import { useRemoteGame } from '@/game/useRemoteGame'
import { rematchGame } from '@/lib/api'
import './screens.css'

interface PlayConfig {
  vsBot: boolean
  opponentName: string
  humanColor: Color
  duels?: boolean
}

function ceremonyHintLine(hint: CeremonyHint, t: (key: string) => string): string | null {
  if (hint === 'stop-die') return t('game.stopDie')
  if (hint === 'wait-die') return t('game.opponentRolling')
  if (hint === 'stop-piece') return t('game.stopPiece')
  if (hint === 'wait-piece') return t('game.opponentChoosingPiece')
  return null
}

export function GameScreen() {
  const location = useLocation()
  const { gameId } = useParams()
  const { t } = useI18n()
  const config = (location.state as PlayConfig | null) ?? {
    vsBot: true,
    opponentName: t('common.bot'),
    humanColor: 'white',
    duels: true,
  }
  if (gameId) {
    // Key by id so following a rematch remounts with fresh state.
    return <RemoteGameScreen key={gameId} gameId={gameId} config={config} />
  }

  return <LocalGameScreen config={config} />
}

function LocalGameScreen({ config }: { config: PlayConfig }) {
  const { user, logout } = useAuth()
  const { t } = useI18n()
  const human = config.humanColor
  const bot: Color = human === 'white' ? 'black' : 'white'

  const game = useGame({
    humanColor: human,
    vsBot: config.vsBot,
    duels: config.duels !== false,
  })
  const {
    state,
    selected,
    legalTargets,
    selectedMoves,
    movableCells,
    placementTargets,
    previewCell,
    pendingDef,
    draftPick,
    confirmDraftPick,
    lastPlaced,
    duel,
    anim,
    isHumanTurn,
  } = game

  // The result modal can be dismissed to inspect the final board; it returns
  // when a new game ends.
  const [resultClosed, setResultClosed] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [ceremonyHint, setCeremonyHint] = useState<CeremonyHint>(null)
  useEffect(() => {
    if (state.phase !== 'over') setResultClosed(false)
  }, [state.phase])
  const showResult = state.phase === 'over' && !duel && !anim && !resultClosed
  const showPlayAgain = state.phase === 'over' && resultClosed && !duel && !anim

  const logNames = useMemo<LogNames>(
    () => ({
      white: human === 'white' ? (user?.name ?? t('common.you')) : config.opponentName,
      black: human === 'black' ? (user?.name ?? t('common.you')) : config.opponentName,
    }),
    [human, user?.name, config.opponentName, t],
  )
  const logEntries = useMemo(
    () => buildActionLog(game.actions, logNames, t),
    [game.actions, logNames, t],
  )
  const logStatus = gameLogStatusLine(
    state.phase,
    false,
    isHumanTurn,
    pendingDef ? pieceName(pendingDef.kind, t) : null,
    t,
    state.lottery,
  )
  const logStatusColor = gameLogStatusColor(state.phase, false, state.turn)
  const showLottery = game.inLottery && state.lottery
  const ceremonyStatus = ceremonyHintLine(ceremonyHint, t)
  const blocked = game.inLottery || !!anim || !!duel

  return (
    <AppStage>
      <AppHeader
        name={user?.name}
        onHelp={() => setRulesOpen(true)}
        onStats={() => setStatsOpen(true)}
        onLogout={logout}
        className="game-topbar"
      />

      <Scoreboard
        state={state}
        human={human}
        bot={bot}
        opponentName={config.opponentName}
        youName={user?.name ?? t('common.you')}
      />

      <GameLog
        entries={logEntries}
        statusLine={showPlayAgain ? null : (ceremonyStatus ?? logStatus)}
        statusColor={showPlayAgain ? null : logStatusColor}
        statusAction={
          showPlayAgain ? { label: t('result.again'), onClick: game.reset } : undefined
        }
      />

      <GameBoard
        board={state.board}
        selected={selected}
        legalTargets={legalTargets}
        selectedMoves={selectedMoves}
        placementTargets={pendingDef ? placementTargets : []}
        lastPlaced={state.phase === 'draft' ? lastPlaced : null}
        movable={isHumanTurn && !blocked ? movableCells : []}
        previewCell={previewCell}
        previewKind={previewCell != null && pendingDef ? pendingDef.kind : null}
        previewOwner={human}
        orientation={human}
        anim={anim}
        onCellClick={game.onCell}
        onCellEnter={game.onCellEnter}
        onBoardLeave={game.clearPreview}
        interactive={isHumanTurn && !blocked}
      />

      <GameCeremonyControls
        human={human}
        lottery={showLottery ? state.lottery ?? null : null}
        canRollLottery={Boolean(showLottery)}
        canStartLottery={Boolean(
          showLottery && state.lottery?.firstTurn && (config.vsBot || state.lottery.firstTurn === human),
        )}
        lotteryBusy={false}
        onRollLottery={game.rollLottery}
        onStartLottery={game.startLottery}
        draftPick={draftPick}
        onConfirmDraftPick={confirmDraftPick}
        duel={duel}
        duelPending={false}
        onDismissDuel={game.dismissDuel}
        onHintChange={setCeremonyHint}
      />

      {showResult && (
        <ResultModal
          status={state.status}
          human={human}
          onAgain={game.reset}
          onClose={() => setResultClosed(true)}
        />
      )}

      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
      {statsOpen && <StatsModal onClose={() => setStatsOpen(false)} />}
    </AppStage>
  )
}

function RemoteGameScreen({ gameId, config }: { gameId: string; config: PlayConfig }) {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { t } = useI18n()
  const remote = useRemoteGame(gameId)
  const [resultClosed, setResultClosed] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [rematching, setRematching] = useState(false)
  const [ceremonyHint, setCeremonyHint] = useState<CeremonyHint>(null)

  useEffect(() => {
    if (remote.state?.phase !== 'over') setResultClosed(false)
  }, [remote.state?.phase])

  // Follow a rematch: once this game points to a fresh one, both players jump
  // there. The pointer chains, so an old shared link always reaches the latest.
  const rematchId = remote.game?.rematch_id ?? null
  const myColor = remote.player?.color
  useEffect(() => {
    if (rematchId && rematchId !== gameId) {
      navigate(`/play/${rematchId}`, {
        state: { vsBot: false, opponentName: config.opponentName, humanColor: myColor ?? 'white' },
      })
    }
  }, [rematchId, gameId, navigate, config.opponentName, myColor])

  const playAgain = async () => {
    setRematching(true)
    try {
      await rematchGame(gameId)
      await remote.refresh() // surfaces rematch_id → the effect navigates us
    } catch {
      setRematching(false)
    }
  }

  const human = remote.player?.color ?? config.humanColor
  const opponentColor: Color = human === 'white' ? 'black' : 'white'
  const opponent = remote.players.find((p) => p.color === opponentColor)
  const opponentName = opponent?.profiles?.display_name ?? config.opponentName ?? t('common.friend')
  const waiting = remote.game?.status === 'waiting'
  const inLottery = remote.inLottery
  const showLottery = inLottery && remote.state?.lottery && !waiting && remote.players.length >= 2
  const blocked = waiting || inLottery || remote.duel || remote.thinking
  const youName = user?.name ?? t('common.you')

  const logNames = useMemo<LogNames>(() => {
    const nameFor = (color: Color) => {
      const row = remote.players.find((p) => p.color === color)
      return row?.profiles?.display_name ?? (color === human ? youName : opponentName)
    }
    return { white: nameFor('white'), black: nameFor('black') }
  }, [remote.players, human, youName, opponentName])
  const logEntries = useMemo(
    () => buildActionLog(remote.actions, logNames, t),
    [remote.actions, logNames, t],
  )
  const logStatus = remote.state
    ? gameLogStatusLine(
        remote.state.phase,
        waiting,
        remote.isHumanTurn && !waiting,
        remote.pendingDef ? pieceName(remote.pendingDef.kind, t) : null,
        t,
        remote.state.lottery,
      )
    : waiting
      ? t('game.waitingPlayer')
      : null
  const logStatusColor = remote.state
    ? gameLogStatusColor(remote.state.phase, waiting, remote.state.turn)
    : waiting
      ? 'neutral'
      : null
  const ceremonyStatus = ceremonyHintLine(ceremonyHint, t)

  if (remote.loading) {
    return (
      <div className="screen screen--center">
        <p className="muted">{t('game.loadingGame')}</p>
      </div>
    )
  }

  if (!remote.state || !remote.player) {
    return (
      <div className="screen screen--center">
        <p className="muted">{remote.error ?? t('game.notFound')}</p>
        <button className="btn" onClick={() => navigate('/')}>
          {t('game.toLobby')}
        </button>
      </div>
    )
  }

  const state = remote.state
  // Only declare the result once the duel ceremony is fully played out and
  // dismissed — otherwise the win/loss modal pops over a still-rolling duel.
  const showResult = state.phase === 'over' && !remote.duel && !remote.duelPending && !resultClosed
  const showPlayAgain =
    state.phase === 'over' && resultClosed && !remote.duel && !remote.duelPending

  return (
    <AppStage>
      <AppHeader
        name={user?.name}
        onHelp={() => setRulesOpen(true)}
        onStats={() => setStatsOpen(true)}
        onLogout={logout}
        className="game-topbar"
      />

      {remote.error && <p className="muted tiny">{remote.error}</p>}

      <Scoreboard
        state={state}
        human={human}
        bot={opponentColor}
        opponentName={opponentName}
        youName={youName}
        opponentPresence={opponent?.presence ?? null}
      />

      <GameLog
        entries={logEntries}
        statusLine={showPlayAgain ? null : (ceremonyStatus ?? logStatus)}
        statusColor={showPlayAgain ? null : logStatusColor}
        statusAction={
          showPlayAgain
            ? { label: t('result.again'), onClick: playAgain, disabled: rematching }
            : undefined
        }
      />

      <GameBoard
        board={state.board}
        selected={remote.selected}
        legalTargets={remote.legalTargets}
        selectedMoves={remote.selectedMoves}
        placementTargets={remote.pendingDef ? remote.placementTargets : []}
        movable={remote.isHumanTurn && !blocked ? remote.movableCells : []}
        previewCell={remote.previewCell}
        previewKind={remote.previewCell != null && remote.pendingDef ? remote.pendingDef.kind : null}
        previewOwner={human}
        orientation={human}
        anim={null}
        onCellClick={remote.onCell}
        onCellEnter={remote.onCellEnter}
        onBoardLeave={remote.clearPreview}
        interactive={remote.isHumanTurn && !blocked}
      />

      <GameCeremonyControls
        human={human}
        lottery={showLottery ? remote.state.lottery ?? null : null}
        canRollLottery={Boolean(showLottery && remote.isCreator)}
        canStartLottery={Boolean(
          showLottery && remote.state.lottery?.firstTurn === human,
        )}
        lotteryBusy={remote.lotteryRolling || remote.lotteryStarting}
        onRollLottery={remote.rollLottery}
        onStartLottery={remote.startLottery}
        draftPick={remote.draftPick}
        onConfirmDraftPick={remote.confirmDraftPick}
        duel={remote.duel}
        duelPending={remote.duelPending}
        onDismissDuel={remote.dismissDuel}
        onHintChange={setCeremonyHint}
      />

      {showResult && (
        <ResultModal
          status={state.status}
          human={human}
          onAgain={playAgain}
          againBusy={rematching}
          onClose={() => setResultClosed(true)}
        />
      )}

      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
      {statsOpen && <StatsModal onClose={() => setStatsOpen(false)} />}
    </AppStage>
  )
}
