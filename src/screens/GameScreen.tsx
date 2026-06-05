import { useEffect, useState } from 'react'
import { HelpCircle } from 'lucide-react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Board } from '@/components/Board'
import { UserMenu } from '@/components/UserMenu'
import { RulesModal } from '@/components/RulesModal'
import { useGame, type DuelEvent, type DraftPick } from '@/game/useGame'
import { type Color, type GameState } from '@/game/types'
import { PIECES, pieceBadge, type PieceKind } from '@/game/pieces'
import { useAuth } from '@/auth/AuthContext'
import { useI18n } from '@/i18n'
import { useRemoteGame } from '@/game/useRemoteGame'
import type { Presence } from '@/lib/api'
import logoMaeth from '@/assets/logo-maeth.png'
import './screens.css'

/** In-game header: logo, help and the avatar menu — same controls as the lobby. */
function GameTopbar({
  name,
  onHelp,
  onLogout,
}: {
  name?: string
  onHelp: () => void
  onLogout: () => void
}) {
  const { t } = useI18n()
  return (
    <header className="topbar game-topbar">
      <img className="topbar__logo" src={logoMaeth} alt="Maeth" />
      <div className="topbar__right">
        <button
          className="icon-btn"
          onClick={onHelp}
          aria-label={t('lobby.help')}
          title={t('lobby.help')}
        >
          <HelpCircle size={18} />
        </button>
        <UserMenu name={name} onLogout={onLogout} />
      </div>
    </header>
  )
}

interface PlayConfig {
  vsBot: boolean
  opponentName: string
  humanColor: Color
}

export function GameScreen() {
  const location = useLocation()
  const { gameId } = useParams()
  const { t } = useI18n()
  const config = (location.state as PlayConfig | null) ?? {
    vsBot: true,
    opponentName: t('common.bot'),
    humanColor: 'white',
  }
  if (gameId) {
    return <RemoteGameScreen gameId={gameId} config={config} />
  }

  return <LocalGameScreen config={config} />
}

function LocalGameScreen({ config }: { config: PlayConfig }) {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { t } = useI18n()
  const human = config.humanColor
  const bot: Color = human === 'white' ? 'black' : 'white'

  const game = useGame({ humanColor: human, vsBot: config.vsBot })
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

      <StatusBar
        phase={state.phase}
        isHumanTurn={isHumanTurn}
        waiting={false}
        pendingLabel={
          pendingDef ? `${pendingDef.emoji} ${pendingDef.name} · ${pieceBadge(pendingDef.kind)}` : null
        }
      />

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

      <button className="btn btn--ghost btn--sm screen__exit" onClick={() => navigate('/')}>
        {t('game.exit')}
      </button>

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
  const human = remote.player.color
  const opponentColor: Color = human === 'white' ? 'black' : 'white'
  const opponent = remote.players.find((p) => p.color === opponentColor)
  const opponentName = opponent?.profiles?.display_name ?? config.opponentName ?? t('common.friend')
  const waiting = remote.game?.status === 'waiting'
  const showResult = state.phase === 'over' && !resultClosed

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

      <StatusBar
        phase={state.phase}
        isHumanTurn={remote.isHumanTurn && !waiting}
        waiting={waiting}
        pendingLabel={
          remote.pendingDef
            ? `${remote.pendingDef.emoji} ${remote.pendingDef.name} · ${pieceBadge(remote.pendingDef.kind)}`
            : null
        }
      />

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

      <button className="btn btn--ghost btn--sm screen__exit" onClick={() => navigate('/')}>
        {t('game.exit')}
      </button>

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
          onAgain={() => navigate('/')}
          onClose={() => setResultClosed(true)}
          againLabel={t('game.toLobby')}
        />
      )}

      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
    </div>
  )
}

function ResultModal({
  status,
  human,
  onAgain,
  onClose,
  againLabel,
}: {
  status: GameState['status']
  human: Color
  onAgain: () => void
  onClose: () => void
  againLabel?: string
}) {
  const { t } = useI18n()
  const draw = status.kind === 'draw'
  const won = status.kind === 'win' && status.winner === human
  const title = draw ? t('result.draw') : won ? t('result.win') : t('result.loss')
  const sub = draw ? t('result.drawSub') : won ? t('result.winSub') : t('result.lossSub')
  const tone = draw ? 'neutral' : won ? 'good' : 'bad'
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal result-modal result-modal--${tone}`} onClick={(e) => e.stopPropagation()}>
        <div className="result-modal__title">{title}</div>
        <div className="muted">{sub}</div>
        <button className="btn btn--primary" onClick={onAgain}>
          {againLabel ?? t('result.again')}
        </button>
        <button className="btn btn--ghost btn--sm" onClick={onClose}>
          {t('result.viewBoard')}
        </button>
      </div>
    </div>
  )
}

const ROLL_MS = 1000 // how long each die "shuffles" before settling

// Pip positions on a 3×3 grid (cells 1‑9) for each face value.
const PIP_MAP: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
}

function Pips({ value }: { value: number }) {
  const on = PIP_MAP[value] ?? []
  return (
    <span className="pips">
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={`pip ${on.includes(i + 1) ? 'pip--on' : ''}`} />
      ))}
    </span>
  )
}

// A flat die: a single face showing pips, with the values running while rolling.
function Die3D({
  value,
  spinning,
  idle,
}: {
  value: number | null
  spinning: boolean
  idle?: boolean
}) {
  return (
    <div className={`die3d ${spinning ? 'die3d--spin' : ''} ${idle ? 'die3d--idle' : ''}`}>
      <span className="die3d__face">{value ? <Pips value={value} /> : null}</span>
    </div>
  )
}

// The blind-draw reveal: remaining portraits riffle past; on your turn you tap
// anywhere to stop them, then the drawn piece lingers before the modal closes.
function DraftPickModal({
  pick,
  human,
  opponentName,
  onConfirm,
}: {
  pick: DraftPick | null
  human: Color
  opponentName: string
  onConfirm: () => void
}) {
  const { t } = useI18n()
  const [spin, setSpin] = useState<PieceKind | null>(null)

  const open = !!pick
  const settled = pick?.settled ?? null
  const pool = pick?.pool ?? []

  // Riffle through the remaining pieces until the draw settles.
  useEffect(() => {
    if (!open || settled) return
    const id = setInterval(() => {
      setSpin(pool[Math.floor(Math.random() * pool.length)] ?? null)
    }, 90)
    return () => clearInterval(id)
  }, [open, settled, pool])

  if (!pick) return null
  const isYou = pick.by === human
  const closing = !!pick.closing
  const def = settled ? PIECES[settled] : spin ? PIECES[spin] : null
  // While it's your turn and the carousel is still spinning, the whole modal is
  // a tap target that settles the draw.
  const tappable = isYou && !settled && !closing

  return (
    <div className={`modal-backdrop ${closing ? 'modal-backdrop--closing' : ''}`}>
      <div
        className={`modal pick-modal ${closing ? 'pick-modal--closing' : ''} ${
          tappable ? 'pick-modal--tappable' : ''
        }`}
        onClick={tappable ? onConfirm : (e) => e.stopPropagation()}
        role={tappable ? 'button' : undefined}
      >
        <div className="pick-modal__title">
          {settled
            ? isYou
              ? t('draft.yourPiece')
              : t('draft.oppPiece', { name: opponentName })
            : t('draft.picking')}
        </div>
        <div className={`pick-portrait ${settled ? 'pick-portrait--settled' : 'pick-portrait--spin'}`}>
          <span className="pick-portrait__emoji">{def?.emoji ?? '🎲'}</span>
        </div>
        <div className="pick-modal__name">
          {settled && def ? `${def.name} · ${pieceBadge(def.kind)}` : ' '}
        </div>
        <div className="pick-modal__footer">
          {settled ? null : isYou ? (
            <div className="muted tiny">{t('draft.tapToChoose')}</div>
          ) : (
            <div className="muted tiny">{t('draft.opponentPicking', { name: opponentName })}</div>
          )}
        </div>
      </div>
    </div>
  )
}

function DuelModal({
  duel,
  pending,
  human,
  youName,
  opponentName,
  onClose,
}: {
  duel: DuelEvent | null
  pending: boolean
  human: Color
  youName: string
  opponentName: string
  onClose: () => void
}) {
  const { t } = useI18n()
  // 'pre' = both dice spin while we wait for the result (hides network latency);
  // then die 1 settles, die 2 settles, done.
  const [stage, setStage] = useState<'pre' | 'roll1' | 'roll2' | 'done'>('pre')
  const [face1, setFace1] = useState(0)
  const [face2, setFace2] = useState(0)

  const open = pending || !!duel

  // Reset for the next duel once this one is dismissed.
  useEffect(() => {
    if (!open) setStage('pre')
  }, [open])

  // Pre-roll: keep both dice tumbling until the result is known.
  useEffect(() => {
    if (!open || stage !== 'pre') return
    const i1 = setInterval(() => setFace1(Math.floor(Math.random() * 6)), 80)
    const i2 = setInterval(() => setFace2(Math.floor(Math.random() * 6)), 80)
    return () => {
      clearInterval(i1)
      clearInterval(i2)
    }
  }, [open, stage])

  // Settle once the result arrives: die 1 then die 2.
  useEffect(() => {
    if (!duel) return
    setStage('roll1')
    const ts: ReturnType<typeof setTimeout>[] = []
    const spin1 = setInterval(() => setFace1(Math.floor(Math.random() * 6)), 80)
    ts.push(spin1)
    ts.push(
      setTimeout(() => {
        clearInterval(spin1)
        setFace1(duel.attacker - 1)
        setStage('roll2')
        const spin2 = setInterval(() => setFace2(Math.floor(Math.random() * 6)), 80)
        ts.push(spin2)
        ts.push(
          setTimeout(() => {
            clearInterval(spin2)
            setFace2(duel.defender - 1)
            setStage('done')
          }, ROLL_MS),
        )
      }, ROLL_MS),
    )
    return () => {
      ts.forEach((tm) => {
        clearTimeout(tm)
        clearInterval(tm)
      })
    }
  }, [duel])

  if (!open) return null
  const attackerIsYou = duel ? duel.by === human : true // a pending duel is always your own strike
  const attackerName = attackerIsYou ? youName : opponentName
  const defenderName = attackerIsYou ? opponentName : youName
  const good = duel ? duel.success === attackerIsYou : false
  const tone = stage !== 'done' ? '' : good ? 'duel-modal--good' : 'duel-modal--bad'

  return (
    <div className="modal-backdrop">
      <div className={`modal duel-modal ${tone}`} onClick={(e) => e.stopPropagation()}>
        <div className="duel-modal__title">{t('duel.title')}</div>
        <div className="duel-modal__players">
          <span className="duel-modal__player">{attackerName}</span>
          <span className="duel-modal__player">{defenderName}</span>
        </div>
        <div className="duel-modal__dice">
          <div className="die-box">
            <Die3D value={face1 + 1} spinning={stage === 'pre' || stage === 'roll1'} />
          </div>
          <span className="duel-modal__vs">vs</span>
          <div className="die-box">
            <Die3D
              value={stage === 'roll1' ? null : face2 + 1}
              spinning={stage === 'pre' || stage === 'roll2'}
              idle={stage === 'roll1'}
            />
          </div>
        </div>
        <div className="duel-modal__footer">
          {stage === 'done' ? (
            <>
              <div className="duel-modal__result">{duel?.success ? t('duel.success') : t('duel.miss')}</div>
              <button className="btn btn--primary" onClick={onClose}>
                {t('common.close')}
              </button>
            </>
          ) : (
            <div className="muted tiny">{t('duel.rolling')}</div>
          )}
        </div>
      </div>
    </div>
  )
}

function Scoreboard({
  state,
  human,
  bot,
  opponentName,
  youName,
  opponentPresence,
}: {
  state: GameState
  human: Color
  bot: Color
  opponentName: string
  youName: string
  opponentPresence?: Presence | null
}) {
  const { t } = useI18n()
  const presenceTitle = opponentPresence
    ? { 'in-game': t('presence.inGame'), online: t('presence.online'), offline: t('presence.offline') }[
        opponentPresence
      ]
    : undefined
  return (
    <div className="score">
      <div className="score__names">
        <span className="score__name">{youName}</span>
        <span className="score__name">
          {opponentPresence && (
            <span className={`presence-dot presence-dot--${opponentPresence}`} title={presenceTitle} />
          )}
          {opponentName}
        </span>
      </div>
      <div className="score__nums">
        <strong>{state.captures[human]}</strong>
        <span className="score__colon">:</span>
        <strong>{state.captures[bot]}</strong>
      </div>
    </div>
  )
}

// Single, unified status line covering every phase of the game: waiting for an
// opponent, the draft, and the move phase — so it is always clear whose turn it
// is and what is expected next.
function StatusBar({
  phase,
  isHumanTurn,
  waiting,
  pendingLabel,
}: {
  phase: GameState['phase']
  isHumanTurn: boolean
  waiting: boolean
  pendingLabel: string | null
}) {
  const { t } = useI18n()
  if (phase === 'over') return null // shown as a modal

  let text: string
  if (waiting) {
    text = t('game.waitingPlayer')
  } else if (phase === 'draft') {
    if (!isHumanTurn) text = t('game.opponentPlacing')
    else text = pendingLabel ? t('game.placePiece', { piece: pendingLabel }) : t('game.yourDraft')
  } else {
    text = isHumanTurn ? t('game.yourTurn') : t('game.opponentTurn')
  }

  return <div className="statusbar">{text}</div>
}
