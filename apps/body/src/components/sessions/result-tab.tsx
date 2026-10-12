import { SectionLabel } from '@/components/text-block'
import { CheckCircle2, CircleHelp, XCircle } from 'lucide-react'

import { type SessionDetail } from './types'

import { Notice } from './recording-gate'

const statusIcon = {
   ok: <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />,
   warn: <CircleHelp className="size-4 shrink-0 text-amber-600" />,
   fail: <XCircle className="text-destructive size-4 shrink-0" />,
} as const

// What the task itself says about the run. It is the same shape for every task and always shown as plain text, because its
// words come from sites the task visited.
export const ResultTab = ({ session }: { session: SessionDetail }) => {
   const { report } = session

   if (!report) {
      return <Notice>This run has no report.</Notice>
   }

   return (
      <div className="grid gap-6">
         <p className="text-sm font-medium">{report.headline}</p>

         {report.sections.map((section, index) => (
            <section key={`${section.title}-${index}`} className="grid gap-3">
               <SectionLabel>{section.title}</SectionLabel>
               <ul className="grid gap-1.5 rounded-xl border p-4 text-sm" aria-label={section.title}>
                  {section.items.map((item, itemIndex) => (
                     <li key={`${item.label}-${itemIndex}`} className="flex items-start gap-2">
                        {item.status ? statusIcon[item.status] : <span className="size-4 shrink-0" />}
                        <span className="text-muted-foreground shrink-0">{item.label}</span>
                        <span className="min-w-0 break-words">{item.value}</span>
                     </li>
                  ))}
               </ul>
            </section>
         ))}

         {session.workerBuild ? (
            <p className="text-muted-foreground text-xs">
               Run by worker build <span className="font-mono">{session.workerBuild}</span>. The spider picks a new browser
               fingerprint every time, so two runs of one task can differ.
            </p>
         ) : null}
      </div>
   )
}
