import { describe, expect, it } from 'vitest'

import { BLOCK_TYPES, catalog } from '@automatedLinkedIn/contracts'

import { BLOCK_ICONS } from './block-look'
import { summaryOf } from './graph-convert'

// A block is complete in the browser when it has an icon and says something under its title
// (.plan/workflow-engine-p1-block-definition.md). The catalog is the contracts package's own, so a new block is checked here
// without being listed.

describe.each(catalog())('block $type in the browser', block => {
   it('should have an icon', () => {
      expect(BLOCK_ICONS[block.type]).toBeDefined()
   })

   it('should say something under its title with the settings it starts with', () => {
      expect(summaryOf(block, block.defaults).trim()).not.toBe('')
   })
})

describe('the block list', () => {
   it('should hold every block once', () => {
      expect(catalog().map(({ type }) => type)).toEqual([...BLOCK_TYPES])
   })
})
