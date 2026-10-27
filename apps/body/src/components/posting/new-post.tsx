import { Mark } from '@/components/account-profile/mark'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { readableError } from '@/lib/trpc-error'
import { Lightbulb, SquarePen } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'

import { type Account } from '../accounts/types'

import { trpc } from '../../trpc'
import { identityOf } from './accounts'
import { Combobox, type Option } from './combobox'
import { blocksOf } from './draft'
import { type Labels, STARTERS, type Starter } from './landing'

type Props = {
   accounts: Account[]
   labels: Labels
   // The account the list is narrowed to, when it is one; picked here without a click.
   preselected: string
}

const hintOf = (account: Account, client: string | null | undefined) =>
   [client, account.status === 'ACTIVE' ? undefined : 'not signed in'].filter(Boolean).join(' · ') || undefined

// The one way to start a post, for the toolbar: an account, then "Write a post" or an idea. Any account can start a draft; the canvas
// says what a signed-out one cannot do. With one account there is nothing to pick. With several the owner picks (never guessed, so a
// post is not started under another client's name).
export const NewPost = ({ accounts, labels, preselected }: Props) => {
   const navigate = useNavigate()
   const utils = trpc.useUtils()
   const [picked, setPicked] = useState('')
   const only = accounts.length === 1 ? accounts[0] : undefined
   const accountId = only?.id ?? [picked, preselected].find(id => accounts.some(account => account.id === id)) ?? ''
   const account = accounts.find(({ id }) => id === accountId)
   const save = trpc.postDraft.save.useMutation({
      onSuccess: saved => {
         void utils.postDraft.list.invalidate()
         void navigate(`/posting/${saved.accountId}/${saved.id}`)
      },
      onError: error => toast.error(readableError(error)),
   })
   const options: Option[] = accounts.map(item => ({
      value: item.id,
      label: identityOf(item, null).name,
      hint: hintOf(item, labels.get(item.id)),
   }))
   const start = ({ text }: Starter) =>
      save.mutate({
         accountId,
         blocks: blocksOf(text, undefined),
         audience: 'ANYONE',
         comments: 'ANYONE',
         plannedAt: null,
         plannedZone: null,
      })

   return (
      <>
         {only ? (
            <span className="flex items-center gap-2 text-sm">
               <Mark
                  name={identityOf(only, null).name}
                  imageUrl={identityOf(only, null).imageUrl}
                  className="size-6 text-xs"
               />
               <span dir="auto">{identityOf(only, null).name}</span>
            </span>
         ) : (
            <Combobox
               options={options}
               value={accountId}
               onChange={setPicked}
               placeholder="Choose the account"
               label="Post as"
               className="w-60"
            />
         )}
         <DropdownMenu>
            <DropdownMenuTrigger asChild>
               <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!account || save.isPending}
                  title={
                     account
                        ? 'Opens a draft with a few lines to fill in. Nothing is posted.'
                        : 'Choose the account first.'
                  }
               >
                  <Lightbulb />
                  Ideas
               </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
               {STARTERS.map(starter => (
                  <DropdownMenuItem key={starter.id} onSelect={() => start(starter)}>
                     {starter.label}
                  </DropdownMenuItem>
               ))}
            </DropdownMenuContent>
         </DropdownMenu>
         {account ? (
            <Button asChild size="sm">
               <Link to={`/posting/${account.id}`}>
                  <SquarePen />
                  Write a post
               </Link>
            </Button>
         ) : (
            <Button size="sm" disabled title="Choose the account first.">
               <SquarePen />
               Write a post
            </Button>
         )}
      </>
   )
}
