import { describe, expect, it } from 'vitest'

import { createTrpcUrl } from './config'

describe('createTrpcUrl', () => {
   it('defaults to the local brain server', () => {
      expect(createTrpcUrl({})).toBe('http://localhost:3001/trpc')
   })

   it('uses VITE_API_URL and trims trailing slashes', () => {
      expect(createTrpcUrl({ VITE_API_URL: 'https://api.example.com//' })).toBe('https://api.example.com/trpc')
   })

   it('falls back to the default for an empty value', () => {
      expect(createTrpcUrl({ VITE_API_URL: '' })).toBe('http://localhost:3001/trpc')
   })
})
