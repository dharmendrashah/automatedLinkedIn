import { type SessionDetail } from './types'

type Artifact = SessionDetail['artifacts'][number]

type TabbedSession = {
   kind: SessionDetail['kind']
   artifacts: Artifact[]
   report: unknown
}

export type SessionTab = 'summary' | 'result' | 'video' | 'steps' | 'screenshots' | 'network' | 'logs' | 'files'

// The files of a run are named in the folder; the screenshots sit in a sub folder.
export const artifactNameOf = (file: string) => file.split('/').pop() as string

export const findArtifact = (session: { artifacts: Artifact[] }, file: string) =>
   session.artifacts.find(artifact => artifact.name === artifactNameOf(file))

// A task run shows a tab for each kind of file it has; an older session has the fixed tabs it always had.
export const tabsFor = (session: TabbedSession): SessionTab[] => {
   if (session.kind !== 'TASK') {
      return ['summary', 'video', 'steps', 'network', 'logs']
   }

   const has = (...kinds: string[]) => session.artifacts.some(artifact => kinds.includes(artifact.kind))
   const tabs: Array<[SessionTab, boolean]> = [
      ['summary', true],
      ['result', Boolean(session.report)],
      ['video', has('video')],
      ['steps', has('timeline')],
      ['screenshots', has('screenshot')],
      ['network', has('network')],
      ['logs', has('log')],
      ['files', has('file', 'session')],
   ]

   return tabs.filter(([, shown]) => shown).map(([tab]) => tab)
}
