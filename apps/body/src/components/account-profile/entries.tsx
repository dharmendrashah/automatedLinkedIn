import { type ReactNode } from 'react'

import type { AccountProfile } from '@automatedLinkedIn/contracts'

import { ExpandableList } from './expandable-list'
import { ExpandableText } from './expandable-text'
import { totalOf } from './lists'
import { Mark } from './mark'
import { ProfileLink } from './profile-link'
import { Section } from './section'

type Experience = AccountProfile['experience'][number]
type Education = AccountProfile['education'][number]
type Project = AccountProfile['projects']['items'][number]

// One entry of a history: a square picture, a title, lines under it, and a text.
const Entry = ({
   name,
   imageUrl,
   title,
   lines,
   children,
}: {
   name: string
   imageUrl?: string
   title: ReactNode
   lines: Array<string | undefined>
   children?: ReactNode
}) => (
   <div className="flex items-start gap-3">
      <Mark name={name} imageUrl={imageUrl} shape="square" className="size-12 text-base" />
      <div className="grid min-w-0 gap-1">
         <p className="text-sm font-semibold" dir="auto">
            {title}
         </p>
         {lines.filter(Boolean).map(line => (
            <p key={line} className="text-muted-foreground text-xs">
               {line}
            </p>
         ))}
         {children}
      </div>
   </div>
)

const Skills = ({ skills }: { skills: string[] }) =>
   skills.length > 0 ? <p className="text-xs font-medium">{skills.join(' · ')}</p> : null

const ExperienceEntry = ({ job }: { job: Experience }) => (
   <Entry
      name={job.company}
      imageUrl={job.logoUrl}
      title={job.title}
      lines={[
         [job.company, job.employmentType].filter(Boolean).join(' · '),
         [job.dates, job.duration].filter(Boolean).join(' · '),
         [job.location, job.workMode].filter(Boolean).join(' · '),
      ]}
   >
      {job.description ? <ExpandableText text={job.description} lines={3} /> : null}
      <Skills skills={job.skills} />
   </Entry>
)

export const ExperienceCard = ({ experience }: Pick<AccountProfile, 'experience'>) =>
   experience.length > 0 ? (
      <Section title="Experience">
         <ExpandableList items={experience} shown={3} render={job => <ExperienceEntry job={job} />} />
      </Section>
   ) : null

const EducationEntry = ({ school }: { school: Education }) => (
   <Entry
      name={school.school}
      imageUrl={school.logoUrl}
      title={<ProfileLink href={school.schoolUrl}>{school.school}</ProfileLink>}
      lines={[school.degree, school.dates]}
   >
      {school.description ? <ExpandableText text={school.description} lines={3} /> : null}
   </Entry>
)

export const EducationCard = ({ education }: Pick<AccountProfile, 'education'>) =>
   education.length > 0 ? (
      <Section title="Education">
         <ExpandableList items={education} shown={3} render={school => <EducationEntry school={school} />} />
      </Section>
   ) : null

const ProjectEntry = ({ project }: { project: Project }) => (
   <div className="grid gap-1 rounded-lg border p-3">
      <p className="text-sm font-semibold" dir="auto">
         {project.name}
      </p>
      {project.dates ? <p className="text-muted-foreground text-xs">{project.dates}</p> : null}
      {project.description ? <ExpandableText text={project.description} lines={3} /> : null}
      <Skills skills={project.skills} />
      {project.associatedWith ? <p className="text-muted-foreground text-xs">{project.associatedWith}</p> : null}
   </div>
)

export const ProjectsCard = ({ projects }: Pick<AccountProfile, 'projects'>) =>
   projects.items.length > 0 ? (
      <Section title="Projects" count={totalOf(projects)}>
         <ExpandableList
            items={projects.items}
            shown={2}
            total={projects.total}
            render={project => <ProjectEntry project={project} />}
         />
      </Section>
   ) : null
