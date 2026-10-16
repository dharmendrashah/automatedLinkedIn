import config from '@automatedLinkedIn/eslint-config'

// The worker may use database and core; nothing may use the worker, or the router chain that apps/body compiles would reach it.
export default [
   ...config,
   {
      files: ['src/**/*.ts'],
      ignores: ['src/worker/**'],
      rules: {
         'no-restricted-imports': [
            'error',
            {
               patterns: [
                  {
                     group: ['worker', 'worker/*', '**/worker', '**/worker/*'],
                     message: 'Only the worker may import from the worker folder.',
                  },
               ],
            },
         ],
      },
   },
]
