import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { IconTrendingDown, IconTrendingUp } from '@tabler/icons-react'

import type { Change, DashboardOverview } from '@automatedLinkedIn/contracts'

import { type CardText, badgeOf, cardTextsOf } from './dashboard/format'

const GRID =
   'grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card'

const SCOPE =
   'Campaign figures cover complete UTC days and count people found in campaigns (a person in two campaigns counts in each); qualified is the fit at the time of counting; account figures are live.'
const COMPARED = 'compared over campaigns with 60 days of history'

type CardView = CardText & {
   title: string
   // The percent badge of the first three cards; the Active accounts card has plain badge text instead.
   change?: Change
   badgeHint?: string
   line1Hint?: string
}

const ChangeBadge = ({ change, text, hint }: { change?: Change; text: string | null; hint?: string }) => {
   const percent = change ? badgeOf(change) : null
   const label = percent ? percent.text : text

   if (!label) return null

   const badge = (
      <Badge variant="outline">
         {percent?.key === 'up' ? <IconTrendingUp /> : null}
         {percent?.key === 'down' ? <IconTrendingDown /> : null}
         {label}
      </Badge>
   )

   if (!hint) return badge

   return (
      <Tooltip>
         <TooltipTrigger asChild>{badge}</TooltipTrigger>
         <TooltipContent className="max-w-xs">{hint}</TooltipContent>
      </Tooltip>
   )
}

const StatCard = ({ title, big, line1, line1Hint, line2, change, badge, badgeHint }: CardView) => (
   <Card className="@container/card">
      <CardHeader>
         <Tooltip>
            <TooltipTrigger asChild>
               <CardDescription className="w-fit">{title}</CardDescription>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{SCOPE}</TooltipContent>
         </Tooltip>
         <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">{big}</CardTitle>
         <CardAction>
            <ChangeBadge change={change} text={badge} hint={badgeHint} />
         </CardAction>
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1.5 text-sm">
         {line1Hint ? (
            <Tooltip>
               <TooltipTrigger asChild>
                  <div className="line-clamp-1 font-medium">{line1}</div>
               </TooltipTrigger>
               <TooltipContent className="max-w-xs">{line1Hint}</TooltipContent>
            </Tooltip>
         ) : (
            <div className="line-clamp-1 font-medium">{line1}</div>
         )}
         <div className="text-muted-foreground">{line2}</div>
      </CardFooter>
   </Card>
)

export const SectionCards = ({ cards, generatedAt }: { cards: DashboardOverview['cards']; generatedAt: string }) => {
   const texts = cardTextsOf(cards, new Date(generatedAt))

   const views: CardView[] = [
      {
         ...texts.pipeline,
         title: 'Revenue pipeline',
         change: cards.pipeline.replyChange,
         badgeHint: `Replies counted in the last 30 days, ${COMPARED}`,
      },
      {
         ...texts.qualified,
         title: 'Qualified leads (30 days)',
         change: cards.qualified.change,
         badgeHint: `Qualified in the last 30 days, ${COMPARED}`,
      },
      {
         ...texts.invites,
         title: 'Invites sent (30 days)',
         line1Hint: 'Accepts on the day they happened divided by invites sent in the window; not a cohort rate.',
         change: cards.invites.change,
         badgeHint: `Invites sent in the last 30 days, ${COMPARED}`,
      },
      {
         ...texts.accounts,
         title: 'Active accounts',
      },
   ]

   return (
      <div className={GRID}>
         {views.map(view => (
            <StatCard key={view.title} {...view} />
         ))}
      </div>
   )
}

const SkeletonCard = () => (
   <Card className="@container/card">
      <CardHeader>
         <Skeleton className="h-4 w-28" />
         <Skeleton className="h-8 w-32" />
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1.5">
         <Skeleton className="h-4 w-40" />
         <Skeleton className="h-4 w-48" />
      </CardFooter>
   </Card>
)

export const SectionCardsSkeleton = () => (
   <div className={GRID}>
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
   </div>
)
