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
import { noticeOf, viewOf } from '@/components/account-profile/view'
import { ConfirmRunDialog } from '@/components/accounts/confirm-run-dialog'
import { StartAnywayDialog, isBudgetRefusal } from '@/components/accounts/start-anyway-dialog'
import { LOGIN_TASK } from '@/components/accounts/login-test'
import { VISIT_TASK } from '@/components/accounts/visit'
import { BrowseSampleBanner } from '@/components/browsing/browse-sample-banner'
import { BrowsingPanel } from '@/components/browsing/browsing-panel'
import { useBrowsing } from '@/components/browsing/use-browse'
import { FailureCard } from '@/components/failure-card'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
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

// How often the state is asked for while a read goes on (a read takes about 5 minutes).
const READING_POLL_MS = 5000

// The profile of one LinkedIn account as its own page shows it, from the database. The first visit of an account that was never
// read asks brain to read it, and the Read profile button asks for a new read (.plan/account-profile-backend.md). `?sample=` shows
// an invented profile instead, to look at the page.
export const AccountProfile = () => {
   const { id = '' } = useParams()
   const [search, setSearch] = useSearchParams()
   const kind = sampleKindOf(search.get('sample'))
   const sample = kind !== null
   const utils = trpc.useUtils()
   const account = trpc.linkedInAccount.get.useQuery({ id }, { retry: false })
   const proxies = trpc.proxyServer.list.useQuery(undefined, { retry: false })
   const state = trpc.accountProfile.state.useQuery(
      { accountId: id },
      {
         enabled: !sample,
         refetchInterval: query => (query.state.data?.phase === 'READING' ? READING_POLL_MS : false),
      }
   )
   const stored = trpc.accountProfile.get.useQuery(
      {
         accountId: id,
         version: state.data?.capturedAt,
      },
      {
         enabled: !sample && Boolean(state.data?.capturedAt),
         retry: false,
      }
   )
   const sampled = useQuery({
      queryKey: ['account-profile', id, kind],
      queryFn: () => loadProfile(kind ?? 'full'),
      enabled: sample,
   })
   // Browsing time is brain's, or invented with `?browse=` in the address.
   const browseAccounts = useMemo(
      () =>
         account.data ? [{ id: account.data.id, email: account.data.email, status: account.data.status }] : undefined,
      [account.data]
   )
   const browsing = useBrowsing(browseAccounts)
   const browseNow = browsing.byId?.get(id)
   const refresh = () => {
      void utils.accountProfile.state.invalidate({ accountId: id })
      void utils.session.list.invalidate()
   }
   const runTask = trpc.task.run.useMutation({
      onSuccess: () => {
         void utils.linkedInAccount.get.invalidate({ id })
         refresh()
      },
   })
   // The first visit of an account that was never read: brain starts the read when it can, once, and says why when it cannot.
   const open = trpc.accountProfile.open.useMutation({ onSuccess: refresh })
   // The server holds a read that follows a good one too soon; the owner can confirm and read anyway.
   const [recent, setRecent] = useState<string | null>(null)
   // The account may not browse now; the owner can read anyway after saying they understand the risk.
   const [blocked, setBlocked] = useState<string | null>(null)
   const read = trpc.accountProfile.read.useMutation({
      onSuccess: refresh,
      onError: error => {
         if (error.data?.code === 'CONFLICT') {
            setRecent(error.message)
         } else if (isBudgetRefusal(error)) {
            setBlocked(error.message)
         }
      },
   })
   const { firstVisit, blocker } = state.data ?? {}
   const { mutate: openProfile, isIdle: canOpen } = open
   const startFirstRead = !sample && Boolean(firstVisit) && !blocker && canOpen

   useEffect(() => {
      if (startFirstRead) {
         openProfile({ accountId: id })
      }
   }, [startFirstRead, openProfile, id])

   const hasWorkingProxy = proxies.data
      ? proxies.data.some(
           proxy => proxy.linkedInAccountId === id && (proxy.status === 'ACTIVE' || proxy.status === 'GEO_MISMATCH')
        )
      : undefined
   const pending = (task: string) => runTask.isPending && runTask.variables?.task === task
   const profile = sample ? sampled.data?.profile : (stored.data?.profile ?? undefined)
   const view = sample
      ? sampled.isPending
         ? 'LOADING'
         : profile
           ? 'PROFILE'
           : 'EMPTY'
      : viewOf(state.data, Boolean(profile), stored.isPending && stored.fetchStatus !== 'idle', state.isError)
   const reading = state.data?.phase === 'READING' || read.isPending
   const failedNote =
      !sample && view === 'PROFILE' && state.data?.lastRun?.ok === false
         ? `The last read did not give a new profile${state.data.lastRun.message ? `: ${state.data.lastRun.message}` : '.'}`
         : null
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
         readAt={state.data?.capturedAt ?? profile?.captured_at ?? null}
         hasWorkingProxy={hasWorkingProxy}
         testing={pending(LOGIN_TASK)}
         visiting={pending(VISIT_TASK)}
         readBlocker={
            sample ? 'This is sample data. Remove ?sample= from the address.' : (state.data?.blocker ?? undefined)
         }
         reading={reading}
         onTestLogin={() => runTask.mutate({ task: LOGIN_TASK, accountId: id })}
         onVisit={() => runTask.mutate({ task: VISIT_TASK, accountId: id })}
         onRead={() => read.mutate({ accountId: id })}
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

         {kind ? <SampleBanner kind={kind} onChange={next => setSearch({ sample: next }, { replace: true })} /> : null}

         {account.error ? <p className="text-destructive text-sm">{account.error.message}</p> : null}
         {runTask.error ? <p className="text-destructive text-sm">{runTask.error.message}</p> : null}
         {read.error && !recent ? <p className="text-destructive text-sm">{read.error.message}</p> : null}
         {runTask.data ? (
            <p className="text-sm" role="status">
               Started.{' '}
               <Link className="underline underline-offset-4" to={`/sessions?session=${runTask.data.id}`}>
                  Follow it in Sessions
               </Link>
               .
            </p>
         ) : null}

         {browseNow ? (
            <>
               {browsing.kind ? <BrowseSampleBanner kind={browsing.kind} /> : null}
               <Card>
                  <CardContent>
                     <BrowsingPanel account={browseNow} kind={browsing.kind} now={browsing.now} />
                  </CardContent>
               </Card>
            </>
         ) : null}

         {view === 'LOADING' || account.isPending ? <ProfileSkeleton /> : null}

         {view !== 'LOADING' && view !== 'PROFILE' && account.data ? (
            <Card>
               <CardContent className="grid gap-3">
                  {strip}
                  <p className="text-muted-foreground text-sm" role={view === 'READING' ? 'status' : undefined}>
                     {view === 'READING'
                        ? 'Reading the profile. This takes about 5 minutes, and this page updates when it is done.'
                        : view === 'ERROR'
                          ? 'The profile could not be loaded. Check that the server is running, then try again.'
                          : state.data
                            ? noticeOf(state.data)
                            : 'The profile of this account has not been read yet.'}
                  </p>
                  {view === 'ERROR' ? (
                     <Button className="w-fit" variant="outline" size="sm" onClick={() => void state.refetch()}>
                        Try again
                     </Button>
                  ) : null}
               </CardContent>
            </Card>
         ) : null}

         {view === 'PROFILE' && reading ? (
            <p className="text-muted-foreground text-sm" role="status">
               Reading the profile again. This takes about 5 minutes; what is shown is the last read.
            </p>
         ) : null}
         {failedNote ? <p className="text-destructive text-sm">{failedNote}</p> : null}

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

         <ConfirmRunDialog
            message={recent}
            onCancel={() => setRecent(null)}
            onConfirm={() => {
               read.mutate({
                  accountId: id,
                  confirmed: true,
               })
               setRecent(null)
            }}
         />
         <StartAnywayDialog
            message={blocked}
            onCancel={() => setBlocked(null)}
            onConfirm={() => {
               read.mutate({
                  accountId: id,
                  confirmed: true,
                  startAnyway: true,
               })
               setBlocked(null)
            }}
         />
      </div>
   )
}
