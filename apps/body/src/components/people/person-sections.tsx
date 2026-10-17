import { Badge } from '@/components/ui/badge'
import { BriefcaseBusiness, GraduationCap, MessageSquare, Sparkles, ThumbsUp, Building2, Target } from 'lucide-react'
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
            <button type="button" className="text-muted-foreground justify-self-start text-xs underline" onClick={() => setOpen(!open)}>
               {open ? 'Show less' : 'Show more'}
            </button>
         ) : null}
      </Section>
   )
}

const span = (start: string | null, end: string | null) => (start || end ? `${start ?? '?'} – ${end ?? 'Present'}` : null)

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
               lines={[[school.degree, school.field].filter(Boolean).join(', ') || null, span(school.start, school.end)]}
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
   QUALIFIED: 'Qualified',
   MAYBE: 'Maybe',
   UNSCORED: 'Not scored',
}

// How well the person fits: the score a workflow gave and the rules behind it.
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
               <div className="bg-muted h-2 overflow-hidden rounded-full" role="meter" aria-valuenow={member.score} aria-valuemin={0} aria-valuemax={100} aria-label="Score">
                  <div className="bg-primary h-full" style={{ width: `${Math.min(100, member.score)}%` }} />
               </div>
            </div>
         ) : (
            <span className="text-muted-foreground flex-1 text-sm">No workflow scored this person.</span>
         )}
         <Badge variant="outline" className={cn('border-transparent', STATE_TONE[member.state])}>
            {STATE_LABEL[member.state]}
         </Badge>
      </div>
      {member.matched.length > 0 ? (
         <div className="flex flex-wrap gap-1.5">
            {member.matched.map(rule => (
               <Badge key={rule} variant="secondary">
                  {rule}
               </Badge>
            ))}
         </div>
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

// Why a workflow found the person, newest reason first as the workflow kept them.
export const WhyFound = ({ signals }: { signals: Member['signals'] }) => (
   <Section title="Why we found them">
      <ul className="grid gap-3">
         {signals.map((signal, index) => (
            <li key={`${signal.type}-${signal.via}-${index}`} className="grid grid-cols-[auto_1fr] gap-2 text-sm">
               <span className="text-muted-foreground mt-0.5">{SIGNALS[signal.type].icon}</span>
               <div className="grid gap-0.5">
                  <a className="font-medium underline-offset-4 hover:underline" href={signal.via} target="_blank" rel="noreferrer noopener">
                     {SIGNALS[signal.type].label}
                  </a>
                  {signal.excerpt ? <q className="text-muted-foreground text-xs">{signal.excerpt}</q> : null}
                  {signal.at ? <span className="text-muted-foreground text-xs">{new Date(signal.at).toLocaleDateString()}</span> : null}
               </div>
            </li>
         ))}
      </ul>
   </Section>
)
