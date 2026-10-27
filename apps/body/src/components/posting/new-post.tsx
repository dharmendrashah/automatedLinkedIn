import { Mark } from '@/components/account-profile/mark'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { readableError } from '@/lib/trpc-error'
import { Lightbulb, SquarePen } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { type Account } from '../accounts/types'

import { trpc } from '../../trpc'
import { identityOf } from './accounts'
import { type Option, OptionList } from './combobox'
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

// What was asked for while the account is still to be chosen.
type Pending = { kind: 'write' } | { kind: 'idea'; starter: Starter }

// The one way to start a post, for the toolbar: "Write a post" or an idea, always enabled. Any account can start a draft; the canvas
// says what a signed-out one cannot do. With one account, or a list narrowed to one, it goes straight on. With several it asks which
// account first (never guessed, so a post is not started under another client's name).
export const NewPost = ({ accounts, labels, preselected }: Props) => {
   const navigate = useNavigate()
   const utils = trpc.useUtils()
   const [pending, setPending] = useState<Pending | null>(null)
   const only = accounts.length === 1 ? accounts[0] : undefined
   const directId = only?.id ?? accounts.find(({ id }) => id === preselected)?.id
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
   const run = (action: Pending, accountId: string) => {
      if (action.kind === 'write') {
         void navigate(`/posting/${accountId}`)
         return
      }
      save.mutate({
         accountId,
         blocks: blocksOf(action.starter.text, undefined),
         audience: 'ANYONE',
         comments: 'ANYONE',
         plannedAt: null,
         plannedZone: null,
      })
   }
   const ask = (action: Pending) => (directId ? run(action, directId) : setPending(action))

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
         ) : null}
         <DropdownMenu>
            <DropdownMenuTrigger asChild>
               <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={save.isPending}
                  title="Opens a draft with a few lines to fill in. Nothing is posted."
               >
                  <Lightbulb />
                  Ideas
               </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
               {STARTERS.map(starter => (
                  <DropdownMenuItem key={starter.id} onSelect={() => ask({ kind: 'idea', starter })}>
                     {starter.label}
                  </DropdownMenuItem>
               ))}
            </DropdownMenuContent>
         </DropdownMenu>
         <Button type="button" size="sm" onClick={() => ask({ kind: 'write' })}>
            <SquarePen />
            Write a post
         </Button>
         <Dialog open={pending !== null} onOpenChange={open => (open ? undefined : setPending(null))}>
            <DialogContent className="gap-3">
               <DialogHeader>
                  <DialogTitle>Which account is this post for?</DialogTitle>
                  <DialogDescription>Nothing is posted. Next you write it on the canvas.</DialogDescription>
               </DialogHeader>
               <div className="rounded-md border">
                  <OptionList
                     options={options}
                     value=""
                     onPick={accountId => {
                        if (pending) run(pending, accountId)
                        setPending(null)
                     }}
                  />
               </div>
            </DialogContent>
         </Dialog>
      </>
   )
}
