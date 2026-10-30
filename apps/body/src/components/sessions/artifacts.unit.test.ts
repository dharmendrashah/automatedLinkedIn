import { describe, expect, it } from 'vitest'

import { artifactNameOf, findArtifact, tabsFor } from './artifacts'

const artifact = (kind: string, name: string, extra = {}) => ({
   id: `id-${name}`,
   kind,
   name,
   contentType: 'x',
   bytes: 1,
   step: null,
   sensitive: false,
   ...extra,
})

const task = (artifacts: ReturnType<typeof artifact>[], report: unknown = null) => ({
   id: 's1',
   kind: 'TASK' as const,
   artifacts,
   report,
})

describe('artifactNameOf', () => {
   it('should take the file name of a path inside the run folder', () => {
      expect(artifactNameOf('screenshots/01-goto.png')).toBe('01-goto.png')
      expect(artifactNameOf('video.webm')).toBe('video.webm')
   })
})

describe('findArtifact', () => {
   it('should find a file of a task run by its name', () => {
      const session = task([artifact('video', 'video.webm')])

      expect(findArtifact(session, 'video.webm')?.id).toBe('id-video.webm')
      expect(findArtifact(session, 'logs.json')).toBeUndefined()
   })
})

describe('tabsFor', () => {
   it('should show the fixed tabs for an older session', () => {
      expect(tabsFor({ kind: 'VALIDATE_ACCOUNT', artifacts: [], report: null })).toEqual([
         'summary',
         'video',
         'steps',
         'network',
         'logs',
      ])
   })

   it('should show a tab for each kind of file a task run has, and nothing else', () => {
      const session = task(
         [
            artifact('video', 'video.webm'),
            artifact('timeline', 'timeline.json'),
            artifact('screenshot', '01-goto.png'),
            artifact('network', 'network.json'),
            artifact('log', 'logs.json'),
            artifact('file', 'page.html'),
         ],
         { headline: 'x', sections: [] }
      )

      expect(tabsFor(session)).toEqual([
         'summary',
         'result',
         'video',
         'steps',
         'screenshots',
         'network',
         'logs',
         'files',
      ])
   })

   it('should hide the tabs a run has nothing for', () => {
      expect(tabsFor(task([artifact('log', 'logs.json')]))).toEqual(['summary', 'logs'])
   })

   it('should put the login tokens file with the other files', () => {
      expect(tabsFor(task([artifact('session', 'session.json', { sensitive: true })]))).toEqual(['summary', 'files'])
   })
})
