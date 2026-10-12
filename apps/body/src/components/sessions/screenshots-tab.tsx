import { type SessionDetail } from './types'

import { Notice } from './recording-gate'
import { Screenshot } from './steps-tab'

// Every picture a run took, in the order they were saved, including the ones of a whole page that belong to no step.
export const ScreenshotsTab = ({ session }: { session: SessionDetail }) => {
   const pictures = session.artifacts.filter(artifact => artifact.kind === 'screenshot')

   if (pictures.length === 0) {
      return <Notice>No screenshots were taken in this run.</Notice>
   }

   return (
      <ul className="grid gap-4" aria-label="Screenshots">
         {pictures.map(picture => (
            <li key={picture.id} className="grid gap-1.5">
               <span className="text-muted-foreground font-mono text-xs">{picture.name}</span>
               <Screenshot session={session} name={picture.name} alt={`Screenshot ${picture.name}`} />
            </li>
         ))}
      </ul>
   )
}
