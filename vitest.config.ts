import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['scripts/**/*.test.{js,ts}'],
    coverage: {
      provider: 'v8',
      include: ['scripts/**/*.{js,ts}'],
      exclude: ['scripts/**/*.test.{js,ts}', 'scripts/**/*.spec.{js,ts}'],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
})
