import { describe, expect, it } from 'vitest'

import { parseRecordCommand, snapshotName, stepSnapshotName } from './recordCommands'

describe('parseRecordCommand', () => {
   it('should stop on an empty line, whatever the spaces', () => {
      expect(parseRecordCommand('')).toEqual({ kind: 'stop' })
      expect(parseRecordCommand('   ')).toEqual({ kind: 'stop' })
   })

   it('should take a snapshot on s, snap or snapshot, in any case', () => {
      for (const line of ['s', 'S', ' snap ', 'Snapshot']) {
         expect(parseRecordCommand(line)).toEqual({ kind: 'snapshot' })
      }
   })

   it('should not stop on anything else, so a mistyped key never loses a recording', () => {
      expect(parseRecordCommand('x')).toEqual({
         kind: 'unknown',
         line: 'x',
      })
      expect(parseRecordCommand('stop now')).toEqual({
         kind: 'unknown',
         line: 'stop now',
      })
   })
})

describe('snapshotName', () => {
   it('should number the snapshots in order', () => {
      expect(snapshotName(1)).toBe('snap-1')
      expect(snapshotName(12)).toBe('snap-12')
   })

   it('should name the page kept after a step by the step number', () => {
      expect(stepSnapshotName(3)).toBe('step-3')
   })
})
