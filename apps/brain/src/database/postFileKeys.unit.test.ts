import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type PostBlock, postKey } from '@automatedLinkedIn/contracts'

import { dropFiles, keysOf, ownsKeys } from './postFileKeys'

const mocks = vi.hoisted(() => ({ remove: vi.fn() }))

vi.mock('core', () => ({ PostFiles: { remove: mocks.remove } }))

const USER = 'u1'

const document = (key: string | undefined): PostBlock => ({
   id: 'd1',
   type: 'DOCUMENT',
   file: {
      id: 'f1',
      name: 'Slides.pdf',
      bytes: 100,
      key,
   },
})

describe('post file keys', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   it('should list the keys of the files that were uploaded', () => {
      expect(keysOf([document(postKey(USER, 'f1', 'Slides.pdf'))])).toEqual([postKey(USER, 'f1', 'Slides.pdf')])
      expect(keysOf([document(undefined)])).toEqual([])
   })

   it('should only take a key that is where this owner’s upload of the file ends up', () => {
      expect(ownsKeys(USER, [document(postKey(USER, 'f1', 'Slides.pdf'))])).toBe(true)
      expect(ownsKeys(USER, [document(undefined)])).toBe(true)
      expect(ownsKeys(USER, [document(postKey('someone-else', 'f1', 'Slides.pdf'))])).toBe(false)
   })

   it('should delete files and never fail the caller when they cannot be deleted', async () => {
      mocks.remove.mockResolvedValueOnce(0).mockRejectedValueOnce(new Error('bucket down'))
      vi.spyOn(console, 'error').mockImplementation(() => undefined)

      await expect(dropFiles(['a'])).resolves.toBeUndefined()
      await expect(dropFiles(['b'])).resolves.toBeUndefined()
      await dropFiles([])

      expect(mocks.remove).toHaveBeenCalledTimes(2)
   })
})
