import { describe, expect, it } from 'vitest'

import { blockOf } from './workflow'

describe('Score against an ideal customer: AI judgement', () => {
   it('should leave the AI judgement off and its weight at 30 for a block saved before it', () => {
      expect(blockOf('score.icp').config.parse({ icpId: 'icp-1' })).toMatchObject({
         aiJudgement: false,
         aiWeight: 30,
      })
   })

   it('should keep the AI weight between 0 and 100', () => {
      expect(
         blockOf('score.icp').config.safeParse({
            icpId: 'icp-1',
            aiWeight: 101,
         }).success
      ).toBe(false)
      expect(
         blockOf('score.icp').config.safeParse({
            icpId: 'icp-1',
            aiWeight: 0,
         }).success
      ).toBe(true)
   })

   it('should offer the judgement and its weight as fields', () => {
      expect(blockOf('score.icp').fields.map(({ key }) => key)).toEqual(
         expect.arrayContaining(['aiJudgement', 'aiWeight'])
      )
   })
})
