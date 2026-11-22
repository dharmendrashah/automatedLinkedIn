import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resolverComments } from './resolverComments'

let dir: string

const write = (name: string, content: string) => writeFileSync(join(dir, name), content)

describe('resolverComments', () => {
   beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'resolver-comments-'))
   })

   afterEach(() => {
      rmSync(dir, {
         recursive: true,
         force: true,
      })
   })

   it('reads a router\u2019s own comment and each procedure\u2019s comment', () => {
      write(
         'campaign.ts',
         [
            '// Campaigns and the page that reads them.',
            'export const campaign = router({',
            '   list: ownerProcedure.query(() => []),',
            '',
            '   // A new, empty campaign the owner names.',
            '   create: ownerProcedure.input(z.object({ name: z.string() })).mutation(() => null),',
            '})',
            '',
         ].join('\n')
      )

      const { operations, modules } = resolverComments(dir)

      expect(modules.campaign).toBe('Campaigns and the page that reads them.')
      expect(operations['campaign.create']).toBe('A new, empty campaign the owner names.')
      expect(operations['campaign.list']).toBeUndefined()
   })

   it('joins a multi-line comment into one sentence', () => {
      write(
         'connections.ts',
         [
            'export const connections = router({',
            '   // The connections of one account, with the state of a removal;',
            '   // light enough to ask every couple of seconds.',
            '   list: ownerProcedure.query(() => []),',
            '})',
            '',
         ].join('\n')
      )

      const { operations } = resolverComments(dir)

      expect(operations['connections.list']).toBe(
         'The connections of one account, with the state of a removal; light enough to ask every couple of seconds.'
      )
   })

   it('reads a bare procedure export (not wrapped in router())', () => {
      write(
         'acceptRisk.ts',
         [
            '// The owner accepts, once, the notice shown before the first "Act for real".',
            'export const acceptRisk = ownerProcedure.mutation(async ({ ctx }) => null)',
            '',
         ].join('\n')
      )

      const { operations } = resolverComments(dir)

      expect(operations.acceptRisk).toBe('The owner accepts, once, the notice shown before the first "Act for real".')
   })

   it('reads more than one router({ ... }) block from the same file', () => {
      write(
         'page.ts',
         [
            '// A company by slug.',
            'export const companyPage = router({',
            '   detail: ownerProcedure.query(() => null),',
            '})',
            '',
            '// A post by slug.',
            'export const postPage = router({',
            '   detail: ownerProcedure.query(() => null),',
            '})',
            '',
         ].join('\n')
      )

      const { modules } = resolverComments(dir)

      expect(modules.companyPage).toBe('A company by slug.')
      expect(modules.postPage).toBe('A post by slug.')
   })

   it('does not confuse a zod field comment inside .input() for a procedure comment', () => {
      write(
         'workflow.ts',
         [
            'export const workflow = router({',
            '   update: ownerProcedure',
            '      .input(',
            '         z.object({',
            '            // Not a procedure: a field inside the input schema.',
            '            name: z.string().optional(),',
            '         })',
            '      )',
            '      .mutation(() => null),',
            '})',
            '',
         ].join('\n')
      )

      const { operations } = resolverComments(dir)

      expect(operations['workflow.update']).toBeUndefined()
      expect(Object.keys(operations)).not.toContain('workflow.name')
   })

   it('reads nothing from a procedure with no comment above it', () => {
      write(
         'label.ts',
         ['export const label = router({', '   list: ownerProcedure.query(() => []),', '})', ''].join('\n')
      )

      const { operations, modules } = resolverComments(dir)

      expect(operations).toEqual({})
      expect(modules).toEqual({})
   })

   it('skips test files', () => {
      write(
         'campaign.unit.test.ts',
         [
            '// Should never be read.',
            'export const campaign = router({',
            '   list: ownerProcedure.query(() => []),',
            '})',
            '',
         ].join('\n')
      )

      const { operations, modules } = resolverComments(dir)

      expect(operations).toEqual({})
      expect(modules).toEqual({})
   })
})
