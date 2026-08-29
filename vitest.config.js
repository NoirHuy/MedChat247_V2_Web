import { defineConfig } from 'vitest/config'

// Frontend-only unit tests. Backend tests live in back_end/ and run with
// their own vitest config (`npm test` inside back_end/).
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
