import { type UserConfig, defineConfig, mergeConfig } from 'vitest/config'

import { vitestConfig } from '../../vitest.config.ts'

export default mergeConfig(vitestConfig, defineConfig({}) as UserConfig)
