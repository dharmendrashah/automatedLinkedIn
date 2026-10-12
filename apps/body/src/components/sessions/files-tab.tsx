import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'

import { type SessionDetail } from './types'

import { Notice } from './recording-gate'
import { useSessionLink } from './use-session-file'

const formatBytes = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`)

type Artifact = SessionDetail['artifacts'][number]

// Opens one file in a new tab through a link that lasts ten minutes. A file with login tokens is only asked for after the owner
// chose to show sensitive files.
const FileRow = ({ session, artifact, reveal }: { session: SessionDetail; artifact: Artifact; reveal: boolean }) => {
   const [wanted, setWanted] = useState(false)
   const link = useSessionLink(session, artifact.name, {
      enabled: wanted,
      reveal,
   })

   return (
      <li className="flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5">
         <div className="grid min-w-0 gap-0.5">
            <span className="truncate font-mono text-xs">{artifact.name}</span>
            <span className="text-muted-foreground text-xs">
               {artifact.contentType} · {formatBytes(artifact.bytes)}
            </span>
         </div>
         {link.data?.url ? (
            <Button asChild size="sm" variant="outline">
               <a href={link.data.url} target="_blank" rel="noreferrer noopener">
                  Open
               </a>
            </Button>
         ) : (
            <Button size="sm" variant="outline" disabled={wanted && link.isPending} onClick={() => setWanted(true)}>
               {wanted && link.isPending ? <Loader2 className="animate-spin" /> : null}
               Get link
            </Button>
         )}
         {link.error ? <span className="text-destructive text-xs">{link.error.message}</span> : null}
      </li>
   )
}

export const FilesTab = ({ session }: { session: SessionDetail }) => {
   const [showSensitive, setShowSensitive] = useState(false)
   const files = session.artifacts.filter(artifact => artifact.kind === 'file' || artifact.kind === 'session')
   const visible = files.filter(artifact => showSensitive || !artifact.sensitive)
   const hidden = files.length - visible.length

   if (files.length === 0) {
      return <Notice>This run kept no other files.</Notice>
   }

   return (
      <div className="grid gap-3">
         <ul className="grid gap-2" aria-label="Files">
            {visible.map(artifact => (
               <FileRow key={artifact.id} session={session} artifact={artifact} reveal={showSensitive} />
            ))}
         </ul>
         {hidden > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed p-4 text-sm">
               <span className="text-muted-foreground">
                  {hidden} file(s) hold login tokens, so they stay hidden until you ask.
               </span>
               <Button size="sm" variant="outline" onClick={() => setShowSensitive(true)}>
                  Show sensitive files
               </Button>
            </div>
         ) : null}
      </div>
   )
}
