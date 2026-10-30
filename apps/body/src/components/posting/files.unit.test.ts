import { describe, expect, it } from 'vitest'

import { fileProblem, formatBytes, kindOfFile, splitDrop, storedName, totalProblem } from './files'
import { LIMITS } from './rules'

const file = (name: string, size = 1000) => ({
   name,
   size,
})

describe('fileProblem', () => {
   it('should accept a photo or a video of a type LinkedIn takes, whatever the case of its extension', () => {
      expect(fileProblem(file('Holiday.JPG'), 'PHOTOS')).toBeUndefined()
      expect(fileProblem(file('clip.mp4', 5000), 'VIDEO')).toBeUndefined()
   })

   it('should refuse a type that does not fit the block, with the types that do', () => {
      expect(fileProblem(file('doc.pdf'), 'PHOTOS')).toMatch(/jpg, jpeg, png, gif/)
      expect(fileProblem(file('photo.png'), 'VIDEO')).toMatch(/mp4, mov/)
      expect(fileProblem(file('noextension'), 'PHOTOS')).toBeDefined()
   })

   it('should refuse an empty file and one over the size limit', () => {
      expect(fileProblem(file('a.jpg', 0), 'PHOTOS')).toMatch(/empty/)
      expect(fileProblem(file('a.jpg', LIMITS.PHOTO_BYTES + 1), 'PHOTOS')).toMatch(/8 MB/)
      expect(fileProblem(file('a.mp4', LIMITS.VIDEO_BYTES + 1), 'VIDEO')).toMatch(/20 MB/)
   })
})

describe('totalProblem', () => {
   it('should refuse a file that would take the files of a post past 20 MB together, and accept one that fits', () => {
      expect(totalProblem(LIMITS.FILES_BYTES - 1000, file('a.jpg', 1000))).toBeUndefined()
      expect(totalProblem(LIMITS.FILES_BYTES - 1000, file('a.jpg', 1001))).toMatch(/20 MB together/)
   })
})

describe('kindOfFile', () => {
   it('should tell a photo, a video and a document by the name, and nothing for another type', () => {
      expect(kindOfFile('a.PNG')).toBe('PHOTOS')
      expect(kindOfFile('clip.mov')).toBe('VIDEO')
      expect(kindOfFile('Slides.pptx')).toBe('DOCUMENT')
      expect(kindOfFile('archive.zip')).toBeUndefined()
      expect(kindOfFile('noextension')).toBeUndefined()
   })

   it('should refuse a document over the size limit', () => {
      expect(fileProblem(file('a.pdf', LIMITS.DOCUMENT_BYTES + 1), 'DOCUMENT')).toMatch(/20 MB/)
      expect(fileProblem(file('a.pdf'), 'DOCUMENT')).toBeUndefined()
   })
})

describe('splitDrop', () => {
   it('should take the files of the first kind and name the others', () => {
      const dropped = [{ name: 'a.jpg' }, { name: 'b.mp4' }, { name: 'c.png' }, { name: 'd.zip' }]
      const { kind, take, problems } = splitDrop(dropped)

      expect(kind).toBe('PHOTOS')
      expect(take).toEqual([dropped[0], dropped[2]])
      expect(problems).toEqual([
         'b.mp4 was not added: a post holds one kind of attachment.',
         'd.zip is not a type LinkedIn takes.',
      ])
   })

   it('should take nothing when no file is of a type LinkedIn takes', () => {
      expect(splitDrop([{ name: 'x.zip' }])).toEqual({
         kind: undefined,
         take: [],
         problems: ['x.zip is not a type LinkedIn takes.'],
      })
   })
})

describe('storedName', () => {
   it('should keep a short name and drop any folder', () => {
      expect(storedName('a.jpg')).toBe('a.jpg')
      expect(storedName('C:\\pics\\me.png')).toBe('me.png')
   })

   it('should shorten a long name to 120 characters and keep its extension', () => {
      const name = storedName(`${'x'.repeat(300)}.jpg`)

      expect(name).toHaveLength(120)
      expect(name.endsWith('.jpg')).toBe(true)
   })
})

describe('formatBytes', () => {
   it('should write a size in the unit a person reads', () => {
      expect(formatBytes(900)).toBe('900 B')
      expect(formatBytes(2048)).toBe('2 KB')
      expect(formatBytes(3.5 * 1024 * 1024)).toBe('3.5 MB')
   })
})
