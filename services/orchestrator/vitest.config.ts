import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // No test may touch the network or a wallet. Everything is injected.
    testTimeout: 15_000,
  },
})
