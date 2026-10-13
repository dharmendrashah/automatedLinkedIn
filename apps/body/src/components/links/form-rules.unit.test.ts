import { describe, expect, it } from 'vitest'

import { hasChanges, statusChange, tagsChange, textChange, toTagList } from './form-rules'

describe('toTagList', () => {
   it('should split on commas, lowercase, trim and drop empty and repeated tags', () => {
      expect(toTagList(' VIP, lead ,, vip ,')).toEqual(['vip', 'lead'])
   })
})

describe('textChange', () => {
   it('should be undefined when the typed text matches what is saved, ignoring spaces', () => {
      expect(textChange('Ada', ' Ada ')).toBeUndefined()
      expect(textChange(null, '  ')).toBeUndefined()
   })

   it('should give the trimmed text when it changed and null when it was emptied', () => {
      expect(textChange('Ada', ' Grace ')).toBe('Grace')
      expect(textChange(null, ' Grace ')).toBe('Grace')
      expect(textChange('Ada', '  ')).toBeNull()
   })
})

describe('tagsChange', () => {
   it('should treat another case or spacing of the same tags as unchanged', () => {
      expect(tagsChange(['vip', 'lead'], 'VIP,  lead')).toBeUndefined()
   })

   it('should give the cleaned list when it changed, an empty list when all were removed', () => {
      expect(tagsChange(['vip'], 'vip, new-hire')).toEqual(['vip', 'new-hire'])
      expect(tagsChange(['vip'], ' ')).toEqual([])
   })
})

describe('statusChange', () => {
   it('should only give a status that differs from the saved one', () => {
      expect(statusChange('NEW', 'NEW')).toBeUndefined()
      expect(statusChange('NEW', 'REPLIED')).toBe('REPLIED')
   })
})

describe('hasChanges', () => {
   it('should be true only when some field has a value, including null', () => {
      expect(hasChanges({ a: undefined, b: undefined })).toBe(false)
      expect(hasChanges({ a: undefined, b: null })).toBe(true)
      expect(hasChanges({ a: [] })).toBe(true)
   })
})
