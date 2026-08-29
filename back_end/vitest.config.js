import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/routes/', 'src/middleware/', 'src/config/', 'src/services/chat/'],
      exclude: ['src/**/node_modules/**'],
    },
  },
})
