const react = require('eslint-plugin-react')
const base = require('./eslint')

module.exports = [
   ...base,
   react.configs.flat.recommended,
   {
      files: ['**/*.{jsx,tsx}'],
      settings: { react: { version: '18.2.0' } },
      rules: {
         '@typescript-eslint/no-empty-object-type': 'warn',
         'react/no-unescaped-entities': 'warn',
         'react/react-in-jsx-scope': 'off',
      },
   },
]
