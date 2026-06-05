import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Board } from '@/components/Board'
import { useGame, type DuelEvent } from '@/game/useGame'
import { PIECES_PER_SIDE, type Color, type GameState } from '@/game/types'
import { pieceBadge } from '@/game/pieces'
import { useAuth } from '@/auth/AuthContext'
import { useRemoteGame } from '@/game/useRemoteGame'
import './screens.css'

interface PlayConfig {
  vsBot: boolean
  opponentName: string
  humanColor: Color
}

export function GameScreen() {
  const location = useLocation()
  const { gameId } = useParams()
  const config = (location.state as PlayConfig | null) ?? {
    vsBot: true,
    opponentName: 'Бот',
    humanColor: 'white',
  }
  if (gameId) {
    return <RemoteGameScreen gameId={gameId} config={config} />
  }

  return <LocalGameScreen config={config} />
}

function LocalGameScreen({ config }: { config: PlayConfig }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const human = config.humanColor
  const bot: Color = human === 'white' ? 'black' : 'white'

  const game = useGame({ humanColor: human, vsBot: config.vsBot })
  const {
    state,
    selected,
    legalTargets,
    selectedMoves,
    placementTargets,
    previewCell,
    pendingDef,
    duel,
    anim,
    isHumanTurn,
    thinking,
  } = game

  // The result modal can be dismissed to inspect the final board; it returns
  // when a new game ends.
  const [resultClosed, setResultClosed] = useState(false)
  useEffect(() => {
    if (state.phase !== 'over') setResultClosed(false)
  }, [state.phase])
  const showResult = state.phase === 'over' && !duel && !anim && !resultClosed

  return (
    <div className="screen screen--game">
      <header className="topbar">
        <button className="btn btn--ghost btn--sm" onClick={() => navigate('/')}>
          ← Выход
        </button>
        <h2 className="topbar__title">vs {config.opponentName}</h2>
        <button className="btn btn--ghost btn--sm" onClick={game.reset}>
          Заново
        </button>
      </header>

      <Scoreboard
        state={state}
        human={human}
        bot={bot}
        opponentName={config.opponentName}
        youName={user?.name ?? 'Вы'}
      />

      <PlayerTag
        name={config.opponentName}
        color={bot}
        active={state.phase !== 'over' && state.turn === bot}
        thinking={thinking}
      />

      <Board
        board={state.board}
        selected={selected}
        legalTargets={legalTargets}
        selectedMoves={selectedMoves}
        placementTargets={isHumanTurn ? placementTargets : []}
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

      <PlayerTag
        name={user?.name ?? 'Вы'}
        color={human}
        active={state.phase !== 'over' && state.turn === human}
        thinking={false}
      />

      <Panel
        state={state}
        human={human}
        isHumanTurn={isHumanTurn}
        pending={
          pendingDef
            ? { label: `${pendingDef.emoji} ${pendingDef.name} · ${pieceBadge(pendingDef.kind)}` }
            : null
        }
      />

      <DuelModal
        duel={duel}
        human={human}
        youName={user?.name ?? 'Вы'}
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
    </div>
  )
}

function RemoteGameScreen({ gameId, config }: { gameId: string; config: PlayConfig }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const remote = useRemoteGame(gameId)
  const [copied, setCopied] = useState(false)
  const [resultClosed, setResultClosed] = useState(false)

  if (remote.loading) {
    return (
      <div className="screen screen--center">
        <p className="muted">Загрузка игры…</p>
      </div>
    )
  }

  if (!remote.state || !remote.player) {
    return (
      <div className="screen screen--center">
        <p className="muted">{remote.error ?? 'Игра не найдена'}</p>
        <button className="btn" onClick={() => navigate('/')}>
          В лобби
        </button>
      </div>
    )
  }

  const state = remote.state
  const human = remote.player.color
  const opponentColor: Color = human === 'white' ? 'black' : 'white'
  const opponent = remote.players.find((p) => p.color === opponentColor)
  const opponentName = opponent?.profiles?.display_name ?? config.opponentName ?? 'Друг'
  const waiting = remote.game?.status === 'waiting'
  const inviteUrl = `${window.location.origin}/play/${gameId}`
  const showResult = state.phase === 'over' && !resultClosed

  const copyInvite = async () => {
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="screen screen--game">
      <header className="topbar">
        <button className="btn btn--ghost btn--sm" onClick={() => navigate('/')}>
          ← Выход
        </button>
        <h2 className="topbar__title">vs {waiting ? 'ожидаем друга' : opponentName}</h2>
        <button className="btn btn--ghost btn--sm" onClick={() => void remote.refresh()}>
          Обновить
        </button>
      </header>

      {waiting && (
        <section className="card invite-card">
          <h3>Приглашение</h3>
          <p className="muted tiny">Отправьте ссылку другу. Когда он войдет через Google, игра начнется.</p>
          <code className="invite-link">{inviteUrl}</code>
          <button className="btn btn--sm" onClick={copyInvite}>
            {copied ? 'Скопировано' : 'Скопировать ссылку'}
          </button>
        </section>
      )}

      <Scoreboard
        state={state}
        human={human}
        bot={opponentColor}
        opponentName={opponentName}
        youName={user?.name ?? 'Вы'}
      />

      <PlayerTag
        name={opponentName}
        color={opponentColor}
        active={state.phase !== 'over' && state.turn === opponentColor}
        thinking={waiting}
      />

      <Board
        board={state.board}
        selected={remote.selected}
        legalTargets={remote.legalTargets}
        selectedMoves={remote.selectedMoves}
        placementTargets={remote.isHumanTurn ? remote.placementTargets : []}
        previewCell={remote.previewCell}
        previewKind={remote.previewCell != null && remote.pendingDef ? remote.pendingDef.kind : null}
        previewOwner={human}
        orientation="white"
        anim={null}
        onCellClick={remote.onCell}
        onCellEnter={remote.onCellEnter}
        onBoardLeave={remote.clearPreview}
        interactive={remote.isHumanTurn && !waiting && !remote.duel}
      />

      <PlayerTag
        name={user?.name ?? 'Вы'}
        color={human}
        active={state.phase !== 'over' && state.turn === human}
        thinking={false}
      />

      <Panel
        state={state}
        human={human}
        isHumanTurn={remote.isHumanTurn && !waiting}
        pending={
          remote.pendingDef
            ? { label: `${remote.pendingDef.emoji} ${remote.pendingDef.name} · ${pieceBadge(remote.pendingDef.kind)}` }
            : null
        }
      />

      {remote.error && <p className="muted tiny">{remote.error}</p>}

      <DuelModal
        duel={remote.duel}
        human={human}
        youName={user?.name ?? 'Вы'}
        opponentName={opponentName}
        onClose={remote.dismissDuel}
      />

      {showResult && (
        <ResultModal
          status={state.status}
          human={human}
          onAgain={() => navigate('/')}
          onClose={() => setResultClosed(true)}
          againLabel="В лобби"
        />
      )}
    </div>
  )
}

function ResultModal({
  status,
  human,
  onAgain,
  onClose,
  againLabel = 'Ещё раз',
}: {
  status: GameState['status']
  human: Color
  onAgain: () => void
  onClose: () => void
  againLabel?: string
}) {
  const draw = status.kind === 'draw'
  const won = status.kind === 'win' && status.winner === human
  const title = draw ? '🤝 Ничья' : won ? '🎉 Вы победили!' : '😞 Поражение'
  const tone = draw ? 'neutral' : won ? 'good' : 'bad'
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal result-modal result-modal--${tone}`} onClick={(e) => e.stopPropagation()}>
        <div className="result-modal__title">{title}</div>
        <div className="muted">{draw ? 'Поровну побитых фигур' : won ? 'Вы побили больше фигур' : 'Соперник побил больше'}</div>
        <button className="btn btn--primary" onClick={onAgain}>
          {againLabel}
        </button>
        <button className="btn btn--ghost btn--sm" onClick={onClose}>
          Посмотреть доску
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

function DuelModal({
  duel,
  human,
  youName,
  opponentName,
  onClose,
}: {
  duel: DuelEvent | null
  human: Color
  youName: string
  opponentName: string
  onClose: () => void
}) {
  // Sequence: die 1 shuffles then settles, die 2 shuffles then settles, result.
  const [stage, setStage] = useState<'roll1' | 'roll2' | 'done'>('roll1')
  const [face1, setFace1] = useState(0)
  const [face2, setFace2] = useState(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    if (!duel) return
    setStage('roll1')
    const ts = timers.current
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
      ts.forEach((t) => {
        clearTimeout(t)
        clearInterval(t)
      })
      timers.current = []
    }
  }, [duel])

  if (!duel) return null
  const attackerIsYou = duel.by === human
  const attackerName = attackerIsYou ? youName : opponentName
  const defenderName = attackerIsYou ? opponentName : youName
  const good = duel.success === attackerIsYou // good for the human?
  const tone = stage !== 'done' ? '' : good ? 'duel-modal--good' : 'duel-modal--bad'

  return (
    <div className="modal-backdrop">
      <div className={`modal duel-modal ${tone}`} onClick={(e) => e.stopPropagation()}>
        <div className="duel-modal__title">⚔️ Дуэль</div>
        <div className="duel-modal__dice">
          <div className="die-box">
            <Die3D value={face1 + 1} spinning={stage === 'roll1'} />
            <span className="muted tiny">{attackerName} · атака</span>
          </div>
          <span className="duel-modal__vs">vs</span>
          <div className="die-box">
            <Die3D
              value={stage === 'roll1' ? null : face2 + 1}
              spinning={stage === 'roll2'}
              idle={stage === 'roll1'}
            />
            <span className="muted tiny">{defenderName} · защита</span>
          </div>
        </div>
        <div className="duel-modal__footer">
          {stage === 'done' ? (
            <>
              <div className="duel-modal__result">{duel.success ? 'Удар прошёл!' : 'Мимо!'}</div>
              <button className="btn btn--primary" onClick={onClose}>
                Закрыть
              </button>
            </>
          ) : (
            <div className="muted tiny">бросаем кубики…</div>
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
}: {
  state: GameState
  human: Color
  bot: Color
  opponentName: string
  youName: string
}) {
  return (
    <div className="score">
      <div className="score__side">
        <span className="muted tiny">{youName}</span>
        <strong>{state.captures[human]}</strong>
      </div>
      <span className="score__vs">побито</span>
      <div className="score__side">
        <span className="muted tiny">{opponentName}</span>
        <strong>{state.captures[bot]}</strong>
      </div>
    </div>
  )
}

function PlayerTag({
  name,
  color,
  active,
  thinking,
}: {
  name: string
  color: Color
  active: boolean
  thinking: boolean
}) {
  return (
    <div className={`player-tag ${active ? 'player-tag--active' : ''}`}>
      <span className={`chip chip--${color}`} />
      <span className="player-tag__name">{name}</span>
      {thinking && <span className="muted tiny">думает…</span>}
    </div>
  )
}

function Panel({
  state,
  human,
  isHumanTurn,
  pending,
}: {
  state: GameState
  human: Color
  isHumanTurn: boolean
  pending: { label: string } | null
}) {
  if (state.phase === 'over') return null // shown as a modal

  if (state.phase === 'draft') {
    return (
      <div className="statusbar statusbar--col">
        <div className="muted tiny">
          Расставлено: вы {state.placed[human]}/{PIECES_PER_SIDE} · соперник{' '}
          {state.placed[human === 'white' ? 'black' : 'white']}/{PIECES_PER_SIDE}
        </div>
        {isHumanTurn && pending ? (
          <div className="draft-pending">
            <span>Вы вытянули: <strong>{pending.label}</strong></span>
            <span className="muted tiny">
              наведите/коснитесь клетки — стрелки покажут ходы; ещё раз, чтобы поставить
            </span>
          </div>
        ) : (
          <div>Соперник расставляет…</div>
        )}
      </div>
    )
  }

  return (
    <div className="statusbar">{isHumanTurn ? 'Ваш ход — выберите фигуру' : 'Ход соперника'}</div>
  )
}
