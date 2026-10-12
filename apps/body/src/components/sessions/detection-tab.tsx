import { SectionLabel } from '@/components/text-block'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { CheckCircle2, CircleHelp, XCircle } from 'lucide-react'

import { cn } from '@/lib/utils'

import { type SessionDetail } from './types'

import { shortAddress } from './describe'
import { type DetectionPageReport, parseDetection } from './recording'
import { Notice } from './recording-gate'
import { Screenshot } from './steps-tab'
import { useSessionText } from './use-session-file'

const pageNames: Record<string, string> = {
   deviceandbrowserinfo: 'Device and Browser Info',
   pixelscan: 'Pixelscan',
}

const verdicts = {
   HUMAN: {
      label: 'Looks human',
      icon: CheckCircle2,
      className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
   },
   BOT: {
      label: 'Looks like a bot',
      icon: XCircle,
      className: 'bg-destructive/10 text-destructive',
   },
   UNKNOWN: {
      label: 'Could not read',
      icon: CircleHelp,
      className: 'bg-muted text-muted-foreground',
   },
} as const

const Fact = ({ label, children }: { label: string; children: string }) => (
   <div className="grid gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-mono text-xs break-all">{children}</dd>
   </div>
)

// Everything on the page comes from third party sites and the browser, so it is shown as plain text only.
const PageCard = ({ sessionId, report, index }: { sessionId: string; report: DetectionPageReport; index: number }) => {
   const { label, icon: Icon, className } = verdicts[report.verdict]

   return (
      <li className="grid gap-3 rounded-xl border p-4">
         <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="grid gap-0.5">
               <p className="text-sm font-medium">{pageNames[report.page] ?? report.page}</p>
               <p className="text-muted-foreground font-mono text-xs">{shortAddress(report.url)}</p>
            </div>
            <Badge variant="outline" className={cn('gap-1', className)}>
               <Icon />
               {label}
            </Badge>
         </div>

         {report.headline ? <p className="text-sm">{report.headline}</p> : null}
         {report.note ? <p className="text-muted-foreground text-sm">{report.note}</p> : null}

         {report.signals.length > 0 ? (
            <ul className="grid gap-1 text-sm" aria-label={`What ${report.page} checked`}>
               {report.signals.map(signal => (
                  <li key={signal.name} className="flex items-center gap-2">
                     {signal.flagged ? (
                        <XCircle className="text-destructive size-4 shrink-0" />
                     ) : (
                        <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                     )}
                     <span className="break-words">{signal.name}</span>
                     <span className="text-muted-foreground text-xs">{signal.flagged ? 'flagged' : 'clear'}</span>
                  </li>
               ))}
            </ul>
         ) : null}

         {/* The spider names the whole-page pictures 9<position>-fullpage-<page>.png. */}
         <Screenshot
            sessionId={sessionId}
            name={`9${index}-fullpage-${report.page}.png`}
            alt={`The whole ${pageNames[report.page] ?? report.page} page after its check`}
         />
      </li>
   )
}

export const DetectionTab = ({ session }: { session: SessionDetail }) => {
   const file = useSessionText(session.id, 'detection.json')

   if (file.loading) {
      return <Skeleton className="h-40 w-full rounded-xl" />
   }

   if (file.error) {
      return <Notice>{file.error}</Notice>
   }

   const report = file.text ? parseDetection(file.text) : null

   if (!report) {
      return <Notice>This session has no detection report.</Notice>
   }

   return (
      <div className="grid gap-6">
         <section className="grid gap-3">
            <SectionLabel>What each page said</SectionLabel>
            {report.pages.length === 0 ? (
               <Notice>No detection page was visited.</Notice>
            ) : (
               <ul className="grid gap-3">
                  {report.pages.map((page, index) => (
                     <PageCard key={page.page} sessionId={session.id} report={page} index={index} />
                  ))}
               </ul>
            )}
            <p className="text-muted-foreground text-xs">{report.note}</p>
         </section>

         {report.browser ? (
            <section className="grid gap-3">
               <SectionLabel>The browser they saw</SectionLabel>
               <dl className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2">
                  <Fact label="User agent">{report.browser.userAgent}</Fact>
                  <Fact label="Platform">{report.browser.platform}</Fact>
                  <Fact label="Screen">{report.browser.screen}</Fact>
                  <Fact label="Connection">{report.through_proxy ? 'Through the proxy' : 'Without a proxy'}</Fact>
               </dl>
               <p className="text-muted-foreground text-xs">
                  The spider picks a new browser fingerprint every time, so two tests of one proxy can differ.
               </p>
            </section>
         ) : null}
      </div>
   )
}
