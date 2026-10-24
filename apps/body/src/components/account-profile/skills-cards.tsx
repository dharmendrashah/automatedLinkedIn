import type { AccountProfile } from '@automatedLinkedIn/contracts'

import { fullCount } from './counts'
import { ExpandableList } from './expandable-list'
import { totalOf } from './lists'
import { Section } from './section'

export const SkillsCard = ({ skills }: Pick<AccountProfile, 'skills'>) =>
   skills.items.length > 0 ? (
      <Section title="Skills" count={totalOf(skills)}>
         <ExpandableList
            items={skills.items}
            shown={5}
            total={skills.total}
            className="gap-0 divide-y"
            render={skill => (
               <div className="py-2">
                  <p className="text-sm font-semibold" dir="auto">
                     {skill.name}
                  </p>
                  {skill.endorsements ? (
                     <p className="text-muted-foreground text-xs">{fullCount(skill.endorsements)} endorsements</p>
                  ) : null}
               </div>
            )}
         />
      </Section>
   ) : null

export const LanguagesCard = ({ languages }: Pick<AccountProfile, 'languages'>) =>
   languages.items.length > 0 ? (
      <Section title="Languages" count={totalOf(languages)}>
         <ExpandableList
            items={languages.items}
            shown={5}
            total={languages.total}
            className="gap-0 divide-y"
            render={language => (
               <div className="py-2">
                  <p className="text-sm font-semibold" dir="auto">
                     {language.name}
                  </p>
                  {language.proficiency ? (
                     <p className="text-muted-foreground text-xs">{language.proficiency}</p>
                  ) : null}
               </div>
            )}
         />
      </Section>
   ) : null
