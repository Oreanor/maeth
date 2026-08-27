import { useState } from 'react'
import {
  BarChart3,
  Box,
  Circle,
  Globe,
  Grid2X2,
  Hash,
  HelpCircle,
  Home,
  LogIn,
  Image,
  LogOut,
  Moon,
  MessageCircle,
  MessageCircleOff,
  Palette,
  Settings,
  Sun,
} from 'lucide-react'
import { LANGS, useI18n, type Lang } from '@/i18n'
import { useTheme } from '@/theme'
import { SKINS, SKIN_I18N, useSkin, type Skin } from '@/skin'
import {
  BOARD_STYLES,
  BOARD_STYLE_CONFIG,
  useBoardView,
  type BoardStyle,
  type ThreePieceStyle,
} from '@/boardView'
import { useChatSettings } from '@/chat/ChatSettings'

/** Settings button that opens theme, style, language and sign-out. */
export function UserMenu({
  name,
  onLogout,
  onHelp,
  onStats,
  appearanceOnly = false,
  onExit,
  onSignIn,
}: {
  name?: string
  onLogout?: () => void
  onHelp?: () => void
  onStats?: () => void
  /** Login screen: use the identical menu shell but keep only language and theme. */
  appearanceOnly?: boolean
  /** Supplied by the game screen only — the lobby is already the way out. */
  onExit?: () => void
  /** Offered while signed out; signing in is what unlocks online play and stats,
   *  so it leads the menu. */
  onSignIn?: () => void
}) {
  const { t, lang, setLang } = useI18n()
  const { theme, toggle } = useTheme()
  const { skin, setSkin } = useSkin()
  const {
    viewMode,
    setViewMode,
    boardStyle,
    setBoardStyle,
    threePieceStyle,
    setThreePieceStyle,
    coords,
    toggleCoords,
  } = useBoardView()
  const { chatEnabled, toggleChat } = useChatSettings()
  const [open, setOpen] = useState(false)

  return (
    <div className="usermenu">
      <button
        className="icon-btn usermenu__trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('lobby.settings')}
      >
        <Settings size={22} strokeWidth={2} />
      </button>

      {open && (
        <>
          <div className="usermenu__overlay" onClick={() => setOpen(false)} />
          <div className="usermenu__panel" role="menu">
            {name && <div className="usermenu__name">{name}</div>}

            {onSignIn && (
              <button
                className="usermenu__item usermenu__item--accent"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  onSignIn()
                }}
              >
                <LogIn size={18} />
                <span>{t('login.google')}</span>
              </button>
            )}

            <label className="usermenu__item usermenu__item--lang">
              <Globe size={18} />
              <span>{t('lobby.language')}</span>
              <span className="usermenu__tail">
                <select
                  className="usermenu__lang"
                  value={lang}
                  onChange={(e) => setLang(e.target.value as Lang)}
                >
                  {LANGS.map((code) => (
                    <option key={code} value={code}>
                      {t(`languages.${code}`)}
                    </option>
                  ))}
                </select>
                <kbd className="usermenu__shortcut">L</kbd>
              </span>
            </label>

            <button className="usermenu__item" role="menuitem" onClick={toggle}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              <span>{t('lobby.theme')}</span>
              <span className="usermenu__tail">
                <kbd className="usermenu__shortcut">T</kbd>
              </span>
            </button>

            {!appearanceOnly && (
              <>
                <button
                  className="usermenu__item"
                  role="menuitem"
                  onClick={() => setViewMode(viewMode === '2d' ? '3d' : '2d')}
                >
                  {viewMode === '3d' ? <Box size={18} /> : <Grid2X2 size={18} />}
                  <span>{t('lobby.boardView')}</span>
                  <span className="usermenu__tail">
                    <span className="usermenu__value">
                      {viewMode === '3d' ? t('lobby.boardView3d') : t('lobby.boardView2d')}
                    </span>
                    <kbd className="usermenu__shortcut">V</kbd>
                  </span>
                </button>

                <label className="usermenu__item usermenu__item--lang">
                  <Image size={18} />
                  <span>{t('lobby.boardStyle')}</span>
                  <span className="usermenu__tail">
                    <select
                      className="usermenu__lang"
                      value={boardStyle}
                      onChange={(e) => setBoardStyle(e.target.value as BoardStyle)}
                    >
                      {BOARD_STYLES.map((style) => (
                        <option key={style} value={style}>
                          {t('lobby.boardNumber', { number: BOARD_STYLE_CONFIG[style].number })}
                        </option>
                      ))}
                    </select>
                    <kbd className="usermenu__shortcut">B</kbd>
                  </span>
                </label>

                <label className="usermenu__item usermenu__item--lang">
                  {viewMode === '3d' ? <Circle size={18} /> : <Palette size={18} />}
                  <span>{t('lobby.pieceStyle')}</span>
                  <span className="usermenu__tail">
                    {viewMode === '3d' ? (
                      <select
                        className="usermenu__lang"
                        value={threePieceStyle}
                        onChange={(e) => setThreePieceStyle(e.target.value as ThreePieceStyle)}
                      >
                        <option value="painted">{t('lobby.pieceStyle3dPainted')}</option>
                        <option value="classic">{t('lobby.pieceStyle3dClassic')}</option>
                        <option value="wood">{t('lobby.pieceStyle3dWood')}</option>
                        <option value="stone">{t('lobby.pieceStyle3dStone')}</option>
                        <option value="bone">{t('lobby.pieceStyle3dBone')}</option>
                        <option value="metal">{t('lobby.pieceStyle3dMetal')}</option>
                      </select>
                    ) : (
                      <select
                        className="usermenu__lang"
                        value={skin}
                        onChange={(e) => setSkin(e.target.value as Skin)}
                      >
                        {SKINS.map((code) => (
                          <option key={code} value={code}>
                            {t(SKIN_I18N[code])}
                          </option>
                        ))}
                      </select>
                    )}
                    <kbd className="usermenu__shortcut">F</kbd>
                  </span>
                </label>

                <button className="usermenu__item" role="menuitem" onClick={toggleChat}>
                  {chatEnabled ? <MessageCircle size={18} /> : <MessageCircleOff size={18} />}
                  <span>{t('lobby.aiChat')}</span>
                  <span className="usermenu__tail">
                    <span className="usermenu__value">
                      {t(chatEnabled ? 'lobby.aiChatOn' : 'lobby.aiChatOff')}
                    </span>
                    <kbd className="usermenu__shortcut">C</kbd>
                  </span>
                </button>

                <button className="usermenu__item" role="menuitem" onClick={toggleCoords}>
                  <Hash size={18} />
                  <span>{t('lobby.coords')}</span>
                  <span className="usermenu__tail">
                    <span className="usermenu__value">
                      {t(coords ? 'lobby.coordsOn' : 'lobby.coordsOff')}
                    </span>
                    <kbd className="usermenu__shortcut">A</kbd>
                  </span>
                </button>

                {onStats && (
                <button
                  className="usermenu__item"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false)
                    onStats?.()
                  }}
                >
                  <BarChart3 size={18} />
                  <span>{t('stats.title')}</span>
                </button>
                )}

                <button
                  className="usermenu__item"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false)
                    onHelp?.()
                  }}
                >
                  <HelpCircle size={18} />
                  <span>{t('lobby.help')}</span>
                </button>

                {onExit && (
                  <button
                    className="usermenu__item"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false)
                      onExit()
                    }}
                  >
                    <Home size={18} />
                    <span>{t('game.exit')}</span>
                    <span className="usermenu__tail">
                      <kbd className="usermenu__shortcut">Q</kbd>
                    </span>
                  </button>
                )}

                {onLogout && (
                  <button
                    className="usermenu__item usermenu__item--danger"
                    role="menuitem"
                    onClick={onLogout}
                  >
                    <LogOut size={18} />
                    <span>{t('lobby.logout')}</span>
                    <span className="usermenu__tail">
                      <kbd className="usermenu__shortcut">E</kbd>
                    </span>
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
