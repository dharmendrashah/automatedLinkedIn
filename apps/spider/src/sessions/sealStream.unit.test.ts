import { Readable, Writable } from 'node:stream'
import { buffer } from 'node:stream/consumers'
import { pipeline } from 'node:stream/promises'
import { describe, expect, it } from 'vitest'

import { sealStream, unsealStream } from './sealStream'

const KEY = Buffer.alloc(32, 7).toString('base64')

// Feeds `data` in small pieces, as a network stream does.
const chunks = (data: Buffer, size = 7) =>
   Readable.from(
      Array.from({ length: Math.ceil(data.length / size) }, (_, index) =>
         data.subarray(index * size, (index + 1) * size)
      )
   )

const run = async (input: Readable, step: NodeJS.ReadWriteStream) => {
   const parts: Buffer[] = []
   const collect = new Writable({
      write(chunk: Buffer, _encoding, done) {
         parts.push(chunk)
         done()
      },
   })

   await pipeline(input, step, collect)

   return Buffer.concat(parts)
}

describe('sealStream and unsealStream', () => {
   it('should give back exactly what was sealed, read in any piece size', async () => {
      const data = Buffer.from('profile '.repeat(1000))
      const sealed = await run(chunks(data), sealStream(KEY))

      expect(sealed.includes(Buffer.from('profile'))).toBe(false)
      await expect(run(chunks(sealed, 5), unsealStream(KEY))).resolves.toEqual(data)
   })

   it('should seal the same data differently every time', async () => {
      const data = Buffer.from('same')

      expect(await run(chunks(data), sealStream(KEY))).not.toEqual(await run(chunks(data), sealStream(KEY)))
   })

   it('should refuse a sealed stream that was changed', async () => {
      const sealed = await run(chunks(Buffer.from('profile data')), sealStream(KEY))

      sealed[sealed.length - 20] ^= 1

      await expect(run(chunks(sealed), unsealStream(KEY))).rejects.toThrow()
   })

   it('should refuse another key and a stream that is not sealed', async () => {
      const sealed = await run(chunks(Buffer.from('profile data')), sealStream(KEY))

      await expect(run(chunks(sealed), unsealStream(Buffer.alloc(32, 9).toString('base64')))).rejects.toThrow()
      await expect(run(chunks(Buffer.from('not sealed at all, just text')), unsealStream(KEY))).rejects.toThrow()
      await expect(buffer(Readable.from([Buffer.alloc(3)]).pipe(unsealStream(KEY)))).rejects.toThrow()
   })
})
