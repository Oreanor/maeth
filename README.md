# Maeth — Битва за Средиземье 4×4

React-игра на доске 4×4 в духе шахмат: вход через Google, список игроков,
приглашение друга в сетевую партию или игра против бота. Бэкенд — серверless-
функции на Vercel поверх Supabase (Postgres + Auth). Фронтенд также работает как
Telegram Mini App (вход в Telegram пока отложен).

## Правила

16 уникальных фигур, у каждой — паттерн движения и дальность:

- `+` (ortho) — 4 прямых направления, `x` (diag) — 4 диагональных, `*` (all) — все 8.
- Дальность 1–3 клетки. Движение **скользящее**: путь должен быть свободен,
  фигура бьёт врага, останавливаясь на нём.

**Фаза 1 — драфт.** Игроки по очереди вслепую тянут фигуру из общей колоды (16,
без возврата) и ставят на любую свободную клетку. По 4 фигуры на сторону.

**Фаза 2 — ходы.** Каждая фигура ходит максимум один раз. Ходят по очереди
любой не ходившей фигурой; если ходить нечем — пропуск. Игра заканчивается,
когда ни у кого нет доступных ходов. **Побил больше фигур — победил**, поровну —
ничья.

**Дуэли.** Если ты бьёшь фигуру, которая нацелена и на твою атакующую (взаимная
угроза), бой контестится: оба кидают d6, атакующий побеждает при броске не
меньше (ничья кубика — в пользу нападающего, ≈58%). Исход показывается модалкой
с кнопкой «Закрыть» — игра ждёт. Неудачный удар всё равно тратит ход.
Бой по фигуре, которая не может ответить, проходит автоматически.

## Технологии

- **Фронтенд:** React 18 + Vite + TypeScript, React Router.
- **Бэкенд:** Vercel Serverless Functions (`api/*`, `@vercel/node`).
- **БД и авторизация:** Supabase (Postgres, Google OAuth, Row Level Security).
- Сервер авторитетен: вся валидация ходов и броски дуэлей считаются на сервере
  через тот же движок (`src/game/engine.ts`), что и локальная игра с ботом.

## Запуск

### 1. Переменные окружения

Скопируй `.env.example` в `.env` и заполни значениями из проекта Supabase
(Project Settings → API):

```env
VITE_SUPABASE_URL=...          # для фронтенда (Vite)
VITE_SUPABASE_ANON_KEY=...

SUPABASE_URL=...               # для serverless-функций
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...  # секретный ключ, только на сервере
```

> Vercel CLI читает `.env` (а не `.env.local`), поэтому для локального запуска
> функций переменные должны лежать в `.env`.

### 2. База данных

В Supabase открой SQL Editor и прогони `supabase/schema.sql` (таблицы `profiles`,
`games`, `game_players`, `game_invites`, `game_actions` + RLS-политики).

### 3. Google OAuth

- В Supabase: Authentication → Providers → Google, включить и вставить Client
  ID / Secret.
- В Google Cloud Console у OAuth-клиента:
  - **Authorized redirect URIs:** `https://<project-ref>.supabase.co/auth/v1/callback`
  - **Authorized JavaScript origins:** `http://localhost:5173` и адрес прода на
    Vercel.

### 4. Команды

```bash
npm install

# Фронтенд и API одновременно (в двух терминалах):
npm run dev          # Vite на http://localhost:5173 (проксирует /api на :3000)
npm run dev:vercel   # vercel dev — serverless-функции на http://localhost:3000

npm run build        # прод-сборка в dist/
npm run preview      # предпросмотр прод-сборки
npm run typecheck    # проверка типов (src + api)
```

Без настроенного Supabase фронтенд поднимется, но вход через Google и сетевые
игры будут недоступны (можно играть с ботом как гость).

## Деплой на Vercel

1. Импортировать репозиторий в Vercel.
2. Добавить пять переменных окружения из раздела выше (Project Settings →
   Environment Variables).
3. Прогнать `supabase/schema.sql` в проде Supabase (если ещё не сделано).
4. Задеплоить и проверить, что redirect URL прода добавлен в Google/Supabase.

`vercel.json` отдаёт `index.html` на все не-`/api` пути (SPA-роутинг).

## REST API

Все запросы требуют заголовок `Authorization: Bearer <supabase access token>`.

| Метод    | Путь                       | Описание                                  |
| -------- | -------------------------- | ----------------------------------------- |
| `GET`    | `/api/me`                  | профиль текущего пользователя             |
| `GET`    | `/api/friends`             | список других игроков (для приглашений)    |
| `GET`    | `/api/games`               | мои игры + входящие приглашения           |
| `POST`   | `/api/games`               | создать игру (опц. `invitedUserId`)       |
| `GET`    | `/api/games/:id`           | состояние игры + последнее действие        |
| `DELETE` | `/api/games/:id`           | удалить игру (доступно участнику)          |
| `POST`   | `/api/games/:id/join`      | присоединиться к открытой игре            |
| `POST`   | `/api/games/:id/invite`    | создать/перевыпустить приглашение         |
| `POST`   | `/api/games/:id/actions`   | сделать ход (`place` / `move`)            |

## Архитектура

```
api/
  _lib/
    http.ts             json/method/requireAuth, withApiError, unwrap, validateInvitedUser
    request.ts          routeParam, readJsonBody, parseInvitedUserId
  me.ts, friends.ts     профиль и список игроков
  games/
    index.ts            GET список / POST создание игры
    [id].ts             GET состояние / DELETE удаление
    [id]/join.ts        присоединение к игре
    [id]/invite.ts      выпуск приглашения
    [id]/actions.ts     применение хода через движок
src/
  platform/telegram.ts  обёртка над Telegram Mini App SDK (грейсфул в браузере)
  auth/                 AuthContext (Supabase-сессия + гостевой стаб)
  lib/
    supabase.ts         клиент Supabase
    api.ts              типизированный клиент REST API
  game/
    pieces.ts           16 фигур: паттерн (+/x/*), дальность, эмодзи
    types.ts            модель доски, фигур, состояния (draft/play/over)
    engine.ts           драфт, генерация ходов, применение, конец игры
    search.ts           alpha-beta поиск для фазы ходов
    bot.ts              бот: эвристическая расстановка + ход через поиск
    useGame.ts          хук локальной игровой сессии (обе фазы + бот)
    useRemoteGame.ts    хук сетевой игры (поллинг + отправка действий)
  components/Board.tsx  рендер доски 4×4
  screens/              Login, Lobby, Friends, Game (локальная и сетевая)
supabase/schema.sql     таблицы и RLS-политики
```

Игровая логика чистая и детерминированно-тестируемая (`engine.ts`/`pieces.ts`);
и UI, и serverless-функции зависят только от неё. Балансные правки (дальность/
паттерн фигуры) — в `pieces.ts`.

## Дальнейшие этапы

- Telegram Mini App: проверка `initData`, deep-link приглашения через бота.
- Realtime-подписки Supabase вместо поллинга.
- Реальный граф друзей и публичные лобби/матчмейкинг.
