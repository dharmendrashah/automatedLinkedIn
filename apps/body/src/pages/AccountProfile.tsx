import { AboutCard, ContactCard, OpenToWork, ServicesCard } from '@/components/account-profile/about-cards'
import { AccountStrip } from '@/components/account-profile/account-strip'
import { ActivityCard } from '@/components/account-profile/activity-card'
import { EducationCard, ExperienceCard, ProjectsCard } from '@/components/account-profile/entries'
import { InterestsCard } from '@/components/account-profile/interests-card'
import { ProfileHeader } from '@/components/account-profile/profile-header'
import { RecommendationsCard } from '@/components/account-profile/recommendations-card'
import { SampleBanner } from '@/components/account-profile/sample-banner'
import { AnalyticsCard, SuggestionsCard } from '@/components/account-profile/side-cards'
import { LanguagesCard, SkillsCard } from '@/components/account-profile/skills-cards'
import { loadProfile, sampleKindOf } from '@/components/account-profile/source'
import { LOGIN_TASK } from '@/components/accounts/login-test'
import { VISIT_TASK } from '@/components/accounts/visit'
import { FailureCard } from '@/components/failure-card'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router'

import { cn } from '@/lib/utils'

import { trpc } from '../trpc'

const ProfileSkeleton = () => (
   <div className="grid gap-4" aria-busy="true">
      <Skeleton className="h-72 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
   </div>
)

// The profile of one LinkedIn account as its own page shows it. Until the profile can be read, it is a sample (see source.ts).
export const AccountProfile = () => {
   const { id = '' } = useParams()
   const [search, setSearch] = useSearchParams()
   const kind = sampleKindOf(search.get('sample'))
   const utils = trpc.useUtils()
   const account = trpc.linkedInAccount.get.useQuery({ id }, { retry: false })
   const proxies = trpc.proxyServer.list.useQuery(undefined, { retry: false })
   const loaded = useQuery({
      queryKey: ['account-profile', id, kind],
      queryFn: () => loadProfile(kind),
   })
   const runTask = trpc.task.run.useMutation({
      onSuccess: () => {
         void utils.linkedInAccount.get.invalidate({ id })
         void utils.session.list.invalidate()
      },
   })

   const hasWorkingProxy = proxies.data
      ? proxies.data.some(
           proxy => proxy.linkedInAccountId === id && (proxy.status === 'ACTIVE' || proxy.status === 'GEO_MISMATCH')
        )
      : undefined
   const pending = (task: string) => runTask.isPending && runTask.variables?.task === task
   const profile = loaded.data?.profile
   // A new account has nothing for the right rail, so the main column takes the whole width.
   const hasRail = Boolean(
      profile && (profile.analytics || profile.peopleYouMayKnow.length > 0 || profile.youMightLike.length > 0)
   )

   if (account.data === null) {
      return (
         <div className="grid w-full gap-4 px-4 lg:px-6">
            <FailureCard
               title="Account not found"
               message="This account does not exist, or it is not yours."
               to="/accounts"
               action="Back to LinkedIn accounts"
            />
         </div>
      )
   }

   const strip = account.data ? (
      <AccountStrip
         account={account.data}
         readAt={profile?.captured_at ?? null}
         hasWorkingProxy={hasWorkingProxy}
         testing={pending(LOGIN_TASK)}
         visiting={pending(VISIT_TASK)}
         onTestLogin={() => runTask.mutate({ task: LOGIN_TASK, accountId: id })}
         onVisit={() => runTask.mutate({ task: VISIT_TASK, accountId: id })}
      />
   ) : null

   return (
      <div className="grid w-full gap-4 px-4 lg:px-6">
         <Link
            to="/accounts"
            className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm"
         >
            <ChevronLeft className="size-4" aria-hidden />
            LinkedIn accounts
         </Link>

         <SampleBanner kind={kind} onChange={next => setSearch({ sample: next }, { replace: true })} />

         {account.error ? <p className="text-destructive text-sm">{account.error.message}</p> : null}
         {runTask.error ? <p className="text-destructive text-sm">{runTask.error.message}</p> : null}
         {runTask.data ? (
            <p className="text-sm" role="status">
               Started.{' '}
               <Link className="underline underline-offset-4" to={`/sessions?session=${runTask.data.id}`}>
                  Follow it in Sessions
               </Link>
               .
            </p>
         ) : null}

         {loaded.isPending || account.isPending ? <ProfileSkeleton /> : null}

         {!loaded.isPending && !profile && account.data ? (
            <Card>
               <CardContent className="grid gap-3">
                  {strip}
                  <p className="text-muted-foreground text-sm">
                     The profile of this account has not been read yet. It shows here once reading it is built.
                  </p>
               </CardContent>
            </Card>
         ) : null}

         {profile ? (
            <div
               className={cn(
                  'grid grid-cols-[minmax(0,1fr)] items-start gap-4',
                  hasRail && 'lg:grid-cols-[minmax(0,1fr)_22rem]'
               )}
            >
               <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
                  <ProfileHeader profile={profile} strip={strip} />
                  <OpenToWork openToWork={profile.openToWork} />
                  <AboutCard about={profile.about} topSkills={profile.topSkills} />
                  <ContactCard contact={profile.contact} />
                  <ServicesCard services={profile.services} />
                  <ActivityCard activity={profile.activity} />
                  <ExperienceCard experience={profile.experience} />
                  <EducationCard education={profile.education} />
                  <ProjectsCard projects={profile.projects} />
                  <SkillsCard skills={profile.skills} />
                  <RecommendationsCard recommendations={profile.recommendations} />
                  <LanguagesCard languages={profile.languages} />
                  <InterestsCard interests={profile.interests} />
               </div>
               {hasRail ? (
                  <aside className="grid grid-cols-[minmax(0,1fr)] gap-4" aria-label="More about this profile">
                     <AnalyticsCard analytics={profile.analytics} />
                     <SuggestionsCard title="People you may know" entities={profile.peopleYouMayKnow} />
                     <SuggestionsCard title="You might like" entities={profile.youMightLike} shape="square" />
                  </aside>
               ) : null}
            </div>
         ) : null}
      </div>
   )
}
