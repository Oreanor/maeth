import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Unit tests target the pure game logic in src/game (the engine, bot, search,
// log builders and helpers). The React hooks there are excluded — they belong
// to a UI/integration layer, not these node-environment unit tests.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/game/**/*.ts'],
      exclude: [
        'src/game/useGame.ts',
        'src/game/useRemoteGame.ts',
        'src/game/useDraftPick.ts',
        'src/game/timing.ts',
        'src/game/__tests__/**',
      ],
      reporter: ['text', 'html'],
      thresholds: { lines: 85, functions: 85, statements: 85, branches: 80 },
    },
  },
})
