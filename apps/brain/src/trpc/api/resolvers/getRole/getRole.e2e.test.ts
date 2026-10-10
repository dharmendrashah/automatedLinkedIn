import { describe } from 'node:test'
import { expect, it } from 'vitest'

import { client } from 'trpc/client'

describe('getRole', () => {
   it('should reject a request without an access token', async () => {
      await expect(client.getRole.query()).rejects.toMatchObject({ data: { code: 'UNAUTHORIZED' } })
   })
})
