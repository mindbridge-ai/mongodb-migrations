import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.ts'],
    exclude: ["test/common.ts", "test/mm-config.ts"],
    testTimeout: 2000,
    // The tests are sharing the same database collections so can't run in parallel.
    fileParallelism: false,
  },
})
