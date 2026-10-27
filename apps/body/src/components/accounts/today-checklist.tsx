import { TestButton } from '@/components/test-button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Link } from 'react-router'

import { cn } from '@/lib/utils'

import { type Account } from './types'

import { ToneBadge } from '../sessions/session-status-badge'
import { ITEM_ICONS } from './item-icons'
import { loginTestBlocker } from './login-test'
import { StateIcon } from './state-chip'
import { ITEMS, type ItemName, type ItemState, KIND_LABEL, overallTone, progressText } from './today'
import { TONE_CLASS, TONE_EDGE, TONE_TEXT } from './tone-class'
import { type AccountActions } from './use-account-actions'
import { visitBlocker } from './visit'

type Props = {
   account: Account
   // Undefined while the day is being read.
   states: ItemState[] | undefined
   loading: boolean
   error: string | undefined
   actions: AccountActions
   hasProxy: boolean | undefined
}

const sessionLink = (id: string) => `/sessions?session=${id}`

// One row of the checklist: what it is, the last run with its result, the next time, and the manual run.
const Row = ({
   state,
   account,
   actions,
   hasProxy,
}: {
   state: ItemState
   account: Account
   actions: AccountActions
   hasProxy: boolean | undefined
}) => {
   const meta = ITEMS.find(({ item }) => item === state.item)
   const ItemIcon = ITEM_ICONS[state.item]
   const blocker =
      state.item === 'login' ? loginTestBlocker(account.status, hasProxy) : visitBlocker(account.status, hasProxy)
   const run: Record<ItemName, { onClick: () => void; busy: boolean }> = {
      login: { onClick: () => actions.testLogin(account), busy: actions.testingId === account.id },
      visit: { onClick: () => actions.visit(account), busy: actions.visitingId === account.id },
      messages: { onClick: () => actions.askMessages(account), busy: actions.readingMessagesId === account.id },
      network: { onClick: () => actions.readNetwork(account), busy: actions.readingNetworkId === account.id },
   }

   return (
      <li className={cn('grid gap-1.5 border-b border-l-4 py-3 pl-3 last:border-b-0', TONE_EDGE[state.tone])}>
         <div className="flex items-start justify-between gap-3">
            <span className="flex items-center gap-2 font-medium">
               <span className={cn('flex size-6 items-center justify-center rounded-full', TONE_CLASS[state.tone])}>
                  <StateIcon kind={state.kind} />
               </span>
               <ItemIcon className={cn('size-4', TONE_TEXT[state.tone])} aria-hidden />
               {meta?.title}
            </span>
            <TestButton
               label="Run now"
               icon={<ItemIcon />}
               blocker={blocker}
               busy={run[state.item].busy}
               onClick={run[state.item].onClick}
            />
         </div>
         <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Last</dt>
            <dd className="flex flex-wrap items-center gap-2">
               {state.last && state.runId ? (
                  <>
                     <Link className="underline underline-offset-4" to={sessionLink(state.runId)}>
                        {state.last}
                     </Link>
                     {state.result && state.resultTone ? (
                        <ToneBadge label={state.result} tone={state.resultTone} />
                     ) : null}
                  </>
               ) : (
                  <span className="text-muted-foreground">No run in the last 30 days</span>
               )}
               {state.kind === 'FAILED' && state.lastOkId && state.lastOkText ? (
                  <span className="text-muted-foreground text-xs">
                     Last good:{' '}
                     <Link className="underline underline-offset-4" to={sessionLink(state.lastOkId)}>
                        {state.lastOkText}
                     </Link>
                  </span>
               ) : null}
            </dd>
            <dt className="text-muted-foreground">Next</dt>
            <dd>
               <Badge variant="outline" className={cn('font-normal', TONE_CLASS[state.tone])}>
                  {state.next}
               </Badge>{' '}
               <span className={cn('text-xs', TONE_TEXT[state.tone])}>{KIND_LABEL[state.kind]}</span>
            </dd>
         </dl>
         <p className="text-muted-foreground text-xs">{meta?.helper}</p>
      </li>
   )
}

// Today's checklist of one account: the four things the tool does for it, what is done, what is pending and what comes next, with a
// manual run for each.
export const TodayChecklist = ({ account, states, loading, error, actions, hasProxy }: Props) => (
   <div className="grid gap-2">
      <p className="text-muted-foreground text-xs">
         These run by themselves within safe limits. You never need to press anything.
      </p>
      {states ? (
         <>
            <p className={cn('text-sm font-medium', TONE_TEXT[overallTone(states)])}>
               {progressText(states)}.{' '}
               {states.find(({ item }) => item === 'messages')?.kind === 'LATE' ? 'Messages are late.' : ''}
            </p>
            <ul>
               {states.map(state => (
                  <Row key={state.item} state={state} account={account} actions={actions} hasProxy={hasProxy} />
               ))}
            </ul>
         </>
      ) : loading ? (
         <Skeleton className="h-40 w-full" />
      ) : (
         <p className="text-destructive text-sm" role="alert">
            {error ?? 'The checklist could not be read.'}
         </p>
      )}
      {actions.notice ? (
         <p className="text-sm" role="status">
            {actions.notice}
         </p>
      ) : null}
      {actions.error ? (
         <p className="text-destructive text-sm" role="alert">
            {actions.error}
         </p>
      ) : null}
      {actions.started ? (
         <p className="text-sm" role="status">
            Started.{' '}
            <Link className="underline underline-offset-4" to={sessionLink(actions.started.id)}>
               Follow it in Sessions
            </Link>
            .
         </p>
      ) : null}
   </div>
)
