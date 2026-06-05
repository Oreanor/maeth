import { Play, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { useI18n } from '@/i18n'
import { AppHeader } from '@/components/AppHeader'
import { RulesModal } from '@/components/RulesModal'
import { CreateGameModal, type CreateChoice } from '@/components/CreateGameModal'
import { ShareLinkModal } from '@/components/ShareLinkModal'
import { InvitePopup } from '@/components/InvitePopup'
import { ConfirmModal } from '@/components/ConfirmModal'
import { createGame, deleteGame, joinGame, listGames, type ApiGameListItem, type ApiIncomingInvite } from '@/lib/api'
import { useCallback, useEffect, useRef, useState } from 'react'
import './screens.css'

export function LobbyScreen() {
  const { user, logout } = useAuth()
  const { t, lang } = useI18n()
  // Day + time so two games against the same opponent are still distinguishable.
  const formatWhen = (iso?: string) =>
    iso
      ? new Date(iso).toLocaleString(lang, {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : ''
  // Read t through a ref in load effects so switching language doesn't re-fetch.
  const tRef = useRef(t)
  tRef.current = t
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [games, setGames] = useState<ApiGameListItem[]>([])
  const [invites, setInvites] = useState<ApiIncomingInvite[]>([])
  const [loadingGames, setLoadingGames] = useState(false)
  const [joining, setJoining] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  // Game id of a just-created open game whose share link we're showing.
  const [shareGameId, setShareGameId] = useState<string | null>(null)
  const [dismissedInvites, setDismissedInvites] = useState<string[]>([])
  const [confirmTarget, setConfirmTarget] = useState<ApiGameListItem | null>(null)

  const isGoogle = user?.provider === 'google'

  const loadGameLists = useCallback(async () => {
    if (!isGoogle) return
    setLoadingGames(true)
    setError(null)
    try {
      const data = await listGames()
      setGames(data.games)
      setInvites(data.invites)
    } catch (e) {
      setError(e instanceof Error ? e.message : tRef.current('lobby.errLoad'))
    } finally {
      setLoadingGames(false)
    }
  }, [isGoogle])

  useEffect(() => {
    if (!isGoogle) return
    let alive = true
    setLoadingGames(true)
    setError(null)
    listGames()
      .then((data) => {
        if (!alive) return
        setGames(data.games)
        setInvites(data.invites)
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : tRef.current('lobby.errLoad'))
      })
      .finally(() => {
        if (alive) setLoadingGames(false)
      })
    return () => {
      alive = false
    }
  }, [isGoogle])

  // Quietly poll so a freshly received invite (or game update) appears without a
  // manual refresh — and the new-invite popup can pop on its own.
  useEffect(() => {
    if (!isGoogle) return
    const timer = window.setInterval(() => {
      listGames()
        .then((data) => {
          setGames(data.games)
          setInvites(data.invites)
        })
        .catch(() => {
          /* transient; the next tick retries */
        })
    }, 5000)
    return () => window.clearInterval(timer)
  }, [isGoogle])

  const handleCreate = async (choice: CreateChoice) => {
    if (choice.mode === 'bot') {
      navigate('/play', { state: { vsBot: true, opponentName: t('common.bot'), humanColor: 'white' } })
      return
    }

    setCreating(true)
    setCreateError(null)
    try {
      const options =
        choice.mode === 'friend'
          ? { invitedUserId: choice.invitedUserId, invitedEmail: choice.invitedEmail }
          : {}
      const { game } = await createGame(options)
      // Open game: stay in the lobby and hand the creator a share link to send.
      // Friend invite: the friend gets it in their lobby, so just enter the game.
      if (choice.mode === 'open') {
        setCreating(false)
        setCreateOpen(false)
        setShareGameId(game.id)
        void loadGameLists()
        return
      }
      navigate(`/play/${game.id}`, {
        state: { vsBot: false, opponentName: t('common.friend'), humanColor: 'white' },
      })
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : t('lobby.errCreate'))
      setCreating(false)
    }
  }

  const openGame = (item: ApiGameListItem) => {
    navigate(`/play/${item.game.id}`, {
      state: { vsBot: false, opponentName: item.opponentName, humanColor: item.player.color },
    })
  }

  const removeGame = async (item: ApiGameListItem) => {
    setDeleting(item.game.id)
    setError(null)
    try {
      await deleteGame(item.game.id)
      setGames((prev) => prev.filter((g) => g.game.id !== item.game.id))
      setConfirmTarget(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('lobby.errDelete'))
    } finally {
      setDeleting(null)
    }
  }

  const acceptInvite = async (invite: ApiIncomingInvite) => {
    setJoining(invite.game.id)
    setError(null)
    try {
      const { player } = await joinGame(invite.game.id)
      navigate(`/play/${invite.game.id}`, {
        state: { vsBot: false, opponentName: invite.from.name, humanColor: player.color },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : t('lobby.errAccept'))
    } finally {
      setJoining(null)
    }
  }

  const gameStatusLabel = (status: string): string => {
    switch (status) {
      case 'waiting':
        return t('status.waiting')
      case 'active':
        return t('status.active')
      case 'over':
        return t('status.over')
      default:
        return status
    }
  }

  // Show the first invite the user hasn't dismissed yet; a newly arrived one
  // (different id) pops up even after an earlier one was closed.
  const popupInvite = invites.find((inv) => !dismissedInvites.includes(inv.invite.id)) ?? null

  return (
    <div className="screen">
      <AppHeader name={user?.name} onLogout={logout} onHelp={() => setRulesOpen(true)} />

      <button
        className="btn btn--primary btn--block btn--icon-text"
        onClick={() => {
          setCreateError(null)
          setCreateOpen(true)
        }}
      >
        <Plus size={18} />
        {t('lobby.create')}
      </button>

      {error && <p className="muted tiny">{error}</p>}

      {isGoogle && (
        <section className="card">
          <div className="section-head">
            <h3>{t('lobby.yourGames')}</h3>
            <button
              className="icon-btn"
              disabled={loadingGames}
              onClick={loadGameLists}
              aria-label={t('common.refresh')}
              title={t('common.refresh')}
            >
              <RefreshCw size={16} className={loadingGames ? 'spin' : ''} />
            </button>
          </div>
          {loadingGames ? (
            <p className="muted tiny">{t('lobby.loadingGames')}</p>
          ) : games.length === 0 ? (
            <p className="muted tiny">{t('lobby.noGames')}</p>
          ) : (
            <ul className="list">
              {games.map((item) => (
                <li key={item.game.id} className="list__item">
                  <button
                    className="list__item-enter"
                    onClick={() => openGame(item)}
                    aria-label={t('lobby.continueGame')}
                    title={t('lobby.continueGame')}
                  >
                    <span className="list__item-play">
                      <Play size={16} />
                    </span>
                    <span className="list__item-info">
                      <span className="who__name">
                        {item.opponentName ? t('lobby.vs', { name: item.opponentName }) : t('create.optOpen')}
                      </span>
                      <span className="muted tiny">
                        {gameStatusLabel(item.game.status)}
                        {item.game.created_at ? ` · ${formatWhen(item.game.created_at)}` : ''}
                      </span>
                    </span>
                  </button>
                  <button
                    className="icon-btn"
                    disabled={deleting === item.game.id}
                    onClick={() => setConfirmTarget(item)}
                    aria-label={t('lobby.delete')}
                    title={t('lobby.delete')}
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {isGoogle && (
        <section className="card">
          <div className="section-head">
            <h3>{t('lobby.invites')}</h3>
            <button
              className="icon-btn"
              disabled={loadingGames}
              onClick={loadGameLists}
              aria-label={t('common.refresh')}
              title={t('common.refresh')}
            >
              <RefreshCw size={16} className={loadingGames ? 'spin' : ''} />
            </button>
          </div>
          {loadingGames ? (
            <p className="muted tiny">{t('lobby.loadingGames')}</p>
          ) : invites.length === 0 ? (
            <p className="muted tiny">{t('lobby.noInvites')}</p>
          ) : (
            <ul className="list">
              {invites.map((invite) => (
                <li key={invite.invite.id} className="list__item">
                  <div>
                    <div className="who__name">{invite.from.name}</div>
                    <div className="muted tiny">{t('lobby.invitesYou')}</div>
                  </div>
                  <button
                    className="btn btn--sm"
                    disabled={joining === invite.game.id}
                    onClick={() => acceptInvite(invite)}
                  >
                    {joining === invite.game.id ? t('lobby.accepting') : t('lobby.accept')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {createOpen && (
        <CreateGameModal
          isGoogle={isGoogle}
          submitting={creating}
          error={createError}
          onSubmit={handleCreate}
          onClose={() => setCreateOpen(false)}
        />
      )}

      {shareGameId && (
        <ShareLinkModal
          url={`${window.location.origin}/play/${shareGameId}`}
          onClose={() => setShareGameId(null)}
        />
      )}

      {popupInvite && (
        <InvitePopup
          invite={popupInvite}
          entering={joining === popupInvite.game.id}
          onEnter={() => acceptInvite(popupInvite)}
          onClose={() => setDismissedInvites((prev) => [...prev, popupInvite.invite.id])}
        />
      )}

      {confirmTarget && (
        <ConfirmModal
          message={t('lobby.confirmDelete')}
          confirmLabel={t('lobby.delete')}
          cancelLabel={t('create.cancel')}
          busy={deleting === confirmTarget.game.id}
          onConfirm={() => removeGame(confirmTarget)}
          onClose={() => setConfirmTarget(null)}
        />
      )}

      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
    </div>
  )
}
