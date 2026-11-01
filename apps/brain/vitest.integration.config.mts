import { type UserConfig, defineConfig, mergeConfig } from 'vitest/config'

import brainConfig from './vitest.config.mts'

// Integration tests: one database per test file (see testDatabase.ts), after vitest.setup.ts has loaded .env.test.
export default mergeConfig(
   brainConfig,
   defineConfig({
      test: {
         globalSetup: ['vitest.integration.global.ts'],
         setupFiles: ['vitest.integration.setup.mts'],
         // A local build leaves compiled copies of the tests in dist.
         exclude: ['**/node_modules/**', 'dist/**'],
         // Whole workflow runs against a real database; a busy machine must not turn slow into failed.
         testTimeout: 60_000,
         hookTimeout: 60_000,
      },
   }) as UserConfig
)
