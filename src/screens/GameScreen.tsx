import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Board } from '@/components/Board'
import { AppHeader } from '@/components/AppHeader'
import { RulesModal } from '@/components/RulesModal'
import { Scoreboard } from '@/components/Scoreboard'
import { GameLog } from '@/components/GameLog'
import { buildActionLog, type LogNames } from '@/game/actionLog'
import { gameLogStatusColor, gameLogStatusLine } from '@/game/logStatus'
import { ResultModal } from '@/components/ResultModal'
import { DraftPickModal } from '@/components/DraftPickModal'
import { DuelModal } from '@/components/DuelModal'
import { SeriesBar } from '@/components/SeriesBar'
import { useGame } from '@/game/useGame'
import type { Color } from '@/game/types'
import { pieceBadge } from '@/game/pieces'
import { useAuth } from '@/auth/AuthContext'
import { useI18n } from '@/i18n'
import { useRemoteGame } from '@/game/useRemoteGame'
import { rematchGame } from '@/lib/api'
import './screens.css'

/** In-game header: the shared app header, width-matched to the board column. */
function GameTopbar({
  name,
  onHelp,
  onLogout,
}: {
  name?: string
  onHelp: () => void
  onLogout: () => void
}) {
  return <AppHeader name={name} onLogout={onLogout} onHelp={onHelp} className="game-topbar" />
}

interface PlayConfig {
  vsBot: boolean
  opponentName: string
  humanColor: Color
  duels?: boolean
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
  const navigate = useNavigate()
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
  useEffect(() => {
    if (state.phase !== 'over') setResultClosed(false)
  }, [state.phase])
  const showResult = state.phase === 'over' && !duel && !anim && !resultClosed

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
    pendingDef ? `${pendingDef.name} · ${pieceBadge(pendingDef.kind)}` : null,
    t,
  )
  const logStatusColor = gameLogStatusColor(state.phase, false, state.turn)

  return (
    <div className="screen screen--game">
      <GameTopbar name={user?.name} onHelp={() => setRulesOpen(true)} onLogout={logout} />

      <Scoreboard
        state={state}
        human={human}
        bot={bot}
        opponentName={config.opponentName}
        youName={user?.name ?? t('common.you')}
      />

      <GameLog entries={logEntries} statusLine={logStatus} statusColor={logStatusColor} />

      <Board
        board={state.board}
        selected={selected}
        legalTargets={legalTargets}
        selectedMoves={selectedMoves}
        placementTargets={pendingDef ? placementTargets : []}
        lastPlaced={state.phase === 'draft' ? lastPlaced : null}
        movable={isHumanTurn && !anim && !duel ? movableCells : []}
        previewCell={previewCell}
        previewKind={previewCell != null && pendingDef ? pendingDef.kind : null}
        previewOwner={human}
        orientation={human}
        anim={anim}
        onCellClick={game.onCell}
        onCellEnter={game.onCellEnter}
        onBoardLeave={game.clearPreview}
        interactive={isHumanTurn && !anim && !duel}
      />

      <SeriesBar series={game.series} human={human} opponent={bot} />

      <div className="game-end-actions">
        {state.phase === 'over' && resultClosed && (
          <button className="btn btn--sm" onClick={game.reset}>
            {t('result.again')}
          </button>
        )}
        <button className="btn btn--ghost btn--sm screen__exit" onClick={() => navigate('/')}>
          {t('game.exit')}
        </button>
      </div>

      <DraftPickModal
        pick={draftPick}
        human={human}
        opponentName={config.opponentName}
        onConfirm={confirmDraftPick}
      />

      <DuelModal
        duel={duel}
        pending={false}
        human={human}
        youName={user?.name ?? t('common.you')}
        opponentName={config.opponentName}
        onClose={game.dismissDuel}
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
    </div>
  )
}

function RemoteGameScreen({ gameId, config }: { gameId: string; config: PlayConfig }) {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { t } = useI18n()
  const remote = useRemoteGame(gameId)
  const [resultClosed, setResultClosed] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
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
        remote.pendingDef
          ? `${remote.pendingDef.name} · ${pieceBadge(remote.pendingDef.kind)}`
          : null,
        t,
      )
    : waiting
      ? t('game.waitingPlayer')
      : null
  const logStatusColor = remote.state
    ? gameLogStatusColor(remote.state.phase, waiting, remote.state.turn)
    : waiting
      ? 'neutral'
      : null

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

  return (
    <div className="screen screen--game">
      <GameTopbar name={user?.name} onHelp={() => setRulesOpen(true)} onLogout={logout} />

      {remote.error && <p className="muted tiny">{remote.error}</p>}

      <Scoreboard
        state={state}
        human={human}
        bot={opponentColor}
        opponentName={opponentName}
        youName={user?.name ?? t('common.you')}
        opponentPresence={opponent?.presence ?? null}
      />

      <GameLog entries={logEntries} statusLine={logStatus} statusColor={logStatusColor} />

      <Board
        board={state.board}
        selected={remote.selected}
        legalTargets={remote.legalTargets}
        selectedMoves={remote.selectedMoves}
        placementTargets={remote.pendingDef ? remote.placementTargets : []}
        movable={remote.isHumanTurn && !waiting && !remote.duel && !remote.thinking ? remote.movableCells : []}
        previewCell={remote.previewCell}
        previewKind={remote.previewCell != null && remote.pendingDef ? remote.pendingDef.kind : null}
        previewOwner={human}
        orientation="white"
        anim={null}
        onCellClick={remote.onCell}
        onCellEnter={remote.onCellEnter}
        onBoardLeave={remote.clearPreview}
        interactive={remote.isHumanTurn && !waiting && !remote.duel && !remote.thinking}
      />

      {remote.series && <SeriesBar series={remote.series} human={human} opponent={opponentColor} />}

      <div className="game-end-actions">
        {state.phase === 'over' && resultClosed && (
          <button className="btn btn--sm" onClick={playAgain} disabled={rematching}>
            {t('result.again')}
          </button>
        )}
        <button className="btn btn--ghost btn--sm screen__exit" onClick={() => navigate('/')}>
          {t('game.exit')}
        </button>
      </div>

      <DraftPickModal
        pick={remote.draftPick}
        human={human}
        opponentName={opponentName}
        onConfirm={remote.confirmDraftPick}
      />

      <DuelModal
        duel={remote.duel}
        pending={remote.duelPending}
        human={human}
        youName={user?.name ?? t('common.you')}
        opponentName={opponentName}
        onClose={remote.dismissDuel}
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
    </div>
  )
}
