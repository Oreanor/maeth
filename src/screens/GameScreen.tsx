import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { buildActionLog, type LogNames } from '@/game/actionLog'
import { gameLogStatusColor, gameLogStatusLine } from '@/game/logStatus'
import { useGame } from '@/game/useGame'
import { useRemoteGame } from '@/game/useRemoteGame'
import { pieceName } from '@/game/pieces'
import type { Color } from '@/game/types'
import { useAuth } from '@/auth/AuthContext'
import { useI18n } from '@/i18n'
import { rematchGame } from '@/lib/api'
import { GameView } from './GameView'
import './screens.css'

interface PlayConfig {
  vsBot: boolean
  opponentName: string
  humanColor: Color
  duels?: boolean
  /** Bot games only: the position is dealt, not drafted. */
  preset?: boolean
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
  const { user, logout, login } = useAuth()
  const { t } = useI18n()
  const human = config.humanColor
  const bot: Color = human === 'white' ? 'black' : 'white'
  const youName = user?.name ?? t('common.you')

  const game = useGame({
    humanColor: human,
    vsBot: config.vsBot,
    duels: config.duels !== false,
    preset: config.preset === true,
  })
  const { state, pendingDef, duel, anim, isHumanTurn } = game

  const logNames = useMemo<LogNames>(
    () => ({
      white: human === 'white' ? youName : config.opponentName,
      black: human === 'black' ? youName : config.opponentName,
    }),
    [human, youName, config.opponentName],
  )
  const logEntries = useMemo(
    () => buildActionLog(game.actions, logNames, t),
    [game.actions, logNames, t],
  )
  const showLottery = Boolean(game.inLottery && state.lottery)
  const blocked = game.inLottery || !!anim || !!duel

  return (
    <GameView
      userName={user?.name}
      onLogout={logout}
      onSignIn={() => void login('google')}
      state={state}
      human={human}
      opponentColor={bot}
      opponentName={config.opponentName}
      youName={youName}
      logEntries={logEntries}
      logStatus={gameLogStatusLine(
        state.phase,
        false,
        isHumanTurn,
        pendingDef ? pieceName(pendingDef.kind, t) : null,
        t,
        state.lottery,
      )}
      logStatusColor={gameLogStatusColor(state.phase, false, state.turn)}
      selected={game.selected}
      legalTargets={game.legalTargets}
      selectedMoves={game.selectedMoves}
      placementTargets={game.placementTargets}
      movableCells={game.movableCells}
      previewCell={game.previewCell}
      pendingDef={pendingDef}
      lastPlaced={game.lastPlaced}
      anim={anim}
      interactive={isHumanTurn && !blocked}
      onCell={game.onCell}
      onCellEnter={game.onCellEnter}
      clearPreview={game.clearPreview}
      showLottery={showLottery}
      lottery={state.lottery ?? null}
      canRollLottery={showLottery}
      canStartLottery={Boolean(
        showLottery && state.lottery?.firstTurn && (config.vsBot || state.lottery.firstTurn === human),
      )}
      lotteryBusy={false}
      onRollLottery={game.rollLottery}
      onStartLottery={game.startLottery}
      draftPick={game.draftPick}
      onConfirmDraftPick={game.confirmDraftPick}
      duel={duel}
      duelPending={false}
      onDismissDuel={game.dismissDuel}
      resultBlocked={!!duel || !!anim}
      onAgain={game.reset}
    />
  )
}

function RemoteGameScreen({ gameId, config }: { gameId: string; config: PlayConfig }) {
  const navigate = useNavigate()
  const { user, logout, login } = useAuth()
  const { t } = useI18n()
  const remote = useRemoteGame(gameId)
  const [rematching, setRematching] = useState(false)

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
  const showLottery = Boolean(
    inLottery && remote.state?.lottery && !waiting && remote.players.length >= 2,
  )
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
  return (
    <GameView
      userName={user?.name}
      onLogout={logout}
      onSignIn={() => void login('google')}
      state={state}
      human={human}
      opponentColor={opponentColor}
      opponentName={opponentName}
      youName={youName}
      opponentPresence={opponent?.presence ?? null}
      error={remote.error}
      logEntries={logEntries}
      logStatus={gameLogStatusLine(
        state.phase,
        waiting,
        remote.isHumanTurn && !waiting,
        remote.pendingDef ? pieceName(remote.pendingDef.kind, t) : null,
        t,
        state.lottery,
      )}
      logStatusColor={gameLogStatusColor(state.phase, waiting, state.turn)}
      selected={remote.selected}
      legalTargets={remote.legalTargets}
      selectedMoves={remote.selectedMoves}
      placementTargets={remote.placementTargets}
      movableCells={remote.movableCells}
      previewCell={remote.previewCell}
      pendingDef={remote.pendingDef}
      anim={null}
      interactive={remote.isHumanTurn && !blocked}
      onCell={remote.onCell}
      onCellEnter={remote.onCellEnter}
      clearPreview={remote.clearPreview}
      showLottery={showLottery}
      lottery={state.lottery ?? null}
      canRollLottery={Boolean(showLottery && remote.isCreator)}
      canStartLottery={Boolean(showLottery && state.lottery?.firstTurn === human)}
      lotteryBusy={remote.lotteryRolling || remote.lotteryStarting}
      onRollLottery={remote.rollLottery}
      onStartLottery={remote.startLottery}
      draftPick={remote.draftPick}
      onConfirmDraftPick={remote.confirmDraftPick}
      duel={remote.duel}
      duelPending={remote.duelPending}
      onDismissDuel={remote.dismissDuel}
      // Only declare the result once the duel ceremony is fully played out and
      // dismissed — otherwise the win/loss modal pops over a still-rolling duel.
      resultBlocked={Boolean(remote.duel || remote.duelPending)}
      onAgain={playAgain}
      againBusy={rematching}
    />
  )
}
