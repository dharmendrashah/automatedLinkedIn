import { PostCard } from '@/components/posts/post-body'
import { Badge } from '@/components/ui/badge'
import { timeAgo } from '@/lib/time-ago'
import {
   BriefcaseBusiness,
   Building2,
   ExternalLink,
   GraduationCap,
   MessageSquare,
   Sparkles,
   Target,
   ThumbsUp,
} from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { cn } from '@/lib/utils'

import { type PersonDetail } from './types'

type Snapshot = NonNullable<PersonDetail['snapshot']>
type Member = NonNullable<PersonDetail['member']>

// A LinkedIn-like section: a title and its body in a card.
export const Section = ({ title, children, className }: { title: string; children: ReactNode; className?: string }) => (
   <section className={cn('grid gap-3 rounded-xl border p-4', className)}>
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
   </section>
)

const ABOUT_SHORT = 280

export const About = ({ text }: { text: string }) => {
   const [open, setOpen] = useState(false)
   const long = text.length > ABOUT_SHORT

   return (
      <Section title="About">
         <p className="text-sm whitespace-pre-line">{open || !long ? text : `${text.slice(0, ABOUT_SHORT)}…`}</p>
         {long ? (
            <button
               type="button"
               className="text-muted-foreground justify-self-start text-xs underline"
               onClick={() => setOpen(!open)}
            >
               {open ? 'Show less' : 'Show more'}
            </button>
         ) : null}
      </Section>
   )
}

const span = (start: string | null, end: string | null) =>
   start || end ? `${start ?? '?'} – ${end ?? 'Present'}` : null

const Entry = ({ icon, title, lines }: { icon: ReactNode; title: string; lines: (string | null)[] }) => (
   <li className="grid grid-cols-[auto_1fr] gap-3">
      <span className="bg-muted text-muted-foreground grid size-10 place-items-center rounded-md">{icon}</span>
      <div className="grid gap-0.5">
         <span className="text-sm font-medium">{title}</span>
         {lines.filter(Boolean).map(line => (
            <span key={line} className="text-muted-foreground text-xs whitespace-pre-line">
               {line}
            </span>
         ))}
      </div>
   </li>
)

export const Experience = ({ roles }: { roles: Snapshot['experience'] }) => (
   <Section title="Experience">
      <ul className="grid gap-4">
         {roles.map((role, index) => (
            <Entry
               key={`${role.title}-${role.company}-${index}`}
               icon={<BriefcaseBusiness className="size-5" aria-hidden />}
               title={role.title ?? 'Role'}
               lines={[role.company, span(role.start, role.end), role.location, role.description]}
            />
         ))}
      </ul>
   </Section>
)

export const Education = ({ schools }: { schools: Snapshot['education'] }) => (
   <Section title="Education">
      <ul className="grid gap-4">
         {schools.map((school, index) => (
            <Entry
               key={`${school.school}-${index}`}
               icon={<GraduationCap className="size-5" aria-hidden />}
               title={school.school ?? 'School'}
               lines={[
                  [school.degree, school.field].filter(Boolean).join(', ') || null,
                  span(school.start, school.end),
               ]}
            />
         ))}
      </ul>
   </Section>
)

export const Skills = ({ skills }: { skills: string[] }) => (
   <Section title="Skills">
      <div className="flex flex-wrap gap-1.5">
         {skills.map(skill => (
            <Badge key={skill} variant="secondary">
               {skill}
            </Badge>
         ))}
      </div>
   </Section>
)

const STATE_TONE: Record<Member['state'], string> = {
   QUALIFIED: 'bg-success/10 text-success',
   MAYBE: 'bg-warning/10 text-warning',
   UNSCORED: 'bg-muted text-muted-foreground',
}

const STATE_LABEL: Record<Member['state'], string> = {
   QUALIFIED: 'Strong fit',
   MAYBE: 'Maybe',
   UNSCORED: 'No score yet',
}

// How well the person fits: the score a workflow gave and the reasons behind it, with the points each gave.
export const Fit = ({ member }: { member: Member }) => (
   <Section title="Fit" className="bg-muted/30">
      <div className="flex items-center gap-3">
         <Target className="text-muted-foreground size-5" aria-hidden />
         {member.score !== null ? (
            <div className="grid flex-1 gap-1">
               <div className="flex items-baseline justify-between text-sm">
                  <span className="font-semibold">Score {member.score}</span>
                  <span className="text-muted-foreground text-xs">of 100</span>
               </div>
               <div
                  className="bg-muted h-2 overflow-hidden rounded-full"
                  role="meter"
                  aria-valuenow={member.score}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Score"
               >
                  <div className="bg-primary h-full" style={{ width: `${Math.min(100, member.score)}%` }} />
               </div>
            </div>
         ) : (
            <span className="text-muted-foreground flex-1 text-sm">No score yet: no workflow scored this person.</span>
         )}
         <Badge variant="outline" className={cn('border-transparent', STATE_TONE[member.state])}>
            {STATE_LABEL[member.state]}
         </Badge>
      </div>
      {member.reasons.length > 0 ? (
         <ul className="grid gap-1 text-sm">
            {member.reasons.map(reason => (
               <li key={reason.label} className="flex justify-between gap-2">
                  <span>{reason.label}</span>
                  <span className="text-muted-foreground tabular-nums">+{reason.points}</span>
               </li>
            ))}
         </ul>
      ) : member.score !== null ? (
         <p className="text-muted-foreground text-xs">Reasons appear on the next run.</p>
      ) : null}
   </Section>
)

const SIGNALS: Record<Member['signals'][number]['type'], { icon: ReactNode; label: string }> = {
   commented: {
      icon: <MessageSquare className="size-4" aria-hidden />,
      label: 'Commented on a post',
   },
   reacted: {
      icon: <ThumbsUp className="size-4" aria-hidden />,
      label: 'Reacted to a post',
   },
   employee: {
      icon: <Building2 className="size-4" aria-hidden />,
      label: 'Works at a target company',
   },
   hiring: {
      icon: <Sparkles className="size-4" aria-hidden />,
      label: 'Their company is hiring',
   },
}

// Why a workflow found the person: every signal, newest first, with the post they engaged with when the run read it.
export const WhyFound = ({ signals }: { signals: Member['signals'] }) => (
   <Section title="Why we found them">
      <ul className="grid gap-4">
         {[...signals]
            .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
            .map((signal, index) => (
               <li key={`${signal.type}-${signal.via}-${index}`} className="grid grid-cols-[auto_1fr] gap-2 text-sm">
                  <span className="text-muted-foreground mt-0.5">{SIGNALS[signal.type].icon}</span>
                  <div className="grid min-w-0 gap-1.5">
                     <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                        <span className="font-medium">{SIGNALS[signal.type].label}</span>
                        <a
                           className="text-muted-foreground flex items-center gap-1 text-xs underline-offset-4 hover:underline"
                           href={signal.via}
                           target="_blank"
                           rel="noreferrer noopener"
                        >
                           Open on LinkedIn
                           <ExternalLink className="size-3" aria-hidden />
                        </a>
                     </div>
                     {signal.post ? <PostCard post={signal.post} /> : null}
                     {signal.excerpt ? (
                        <p className="text-xs">
                           <span className="text-muted-foreground">
                              {signal.type === 'commented' ? 'Their comment: ' : ''}
                           </span>
                           <q>{signal.excerpt}</q>
                        </p>
                     ) : null}
                     {signal.at ? <span className="text-muted-foreground text-xs">{timeAgo(signal.at)}</span> : null}
                  </div>
               </li>
            ))}
      </ul>
   </Section>
)
