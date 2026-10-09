const js = require('@eslint/js')
const globals = require('globals')
const tsPlugin = require('@typescript-eslint/eslint-plugin')
const tsParser = require('@typescript-eslint/parser')
const prettierConfig = require('eslint-config-prettier')
const prettierPlugin = require('eslint-plugin-prettier')
const unusedImports = require('eslint-plugin-unused-imports')

module.exports = [
   { ignores: ['**/node_modules/**', '**/.turbo/**', '**/dist/**', '**/dev-dist/**', '**/coverage/**'] },
   js.configs.recommended,
   ...tsPlugin.configs['flat/recommended'],
   prettierConfig,
   {
      files: ['**/*.{ts,tsx,mts,cts}'],
      languageOptions: { parser: tsParser, globals: { ...globals.node } },
      plugins: { prettier: prettierPlugin, 'unused-imports': unusedImports },
      rules: {
         'prettier/prettier': ['error', { endOfLine: 'auto' }],
         'no-return-await': ['error'],
         'prefer-destructuring': ['error'],
         'object-shorthand': ['error'],
         'no-unneeded-ternary': ['error'],
         'prefer-template': ['error'],
         '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
         'no-empty': ['error', { allowEmptyCatch: true }],
         'unused-imports/no-unused-imports': 'warn',
         '@typescript-eslint/no-unused-vars': [
            'error',
            {
               argsIgnorePattern: '^_',
               varsIgnorePattern: '^_',
            },
         ],
         'object-curly-newline': [
            'warn',
            {
               ObjectExpression: {
                  multiline: true,
                  minProperties: 2,
               },
            },
         ],
      },
   },
]
