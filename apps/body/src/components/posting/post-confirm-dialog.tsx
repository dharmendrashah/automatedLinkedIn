import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
} from '@/components/ui/alert-dialog'

import type { PostVisibility } from '@automatedLinkedIn/contracts'

import { reachText } from './visibility'

type Props = {
   // What is being confirmed; none keeps the dialog closed.
   mode: 'now' | 'schedule' | undefined
   account: string
   // The words in short and what the post carries, as the drafts list shows them.
   words: string
   attachment: string | undefined
   audience: PostVisibility
   comments: PostVisibility
   // When it is planned for, for the plan.
   plannedText: string | undefined
   onConfirm: () => void
   onCancel: () => void
}

// Posting is real: the dialog says so, with the account, the words and the attachment, before anything is sent.
export const PostConfirmDialog = ({ mode, account, words, attachment, audience, comments, plannedText, onConfirm, onCancel }: Props) => (
   <AlertDialog open={mode !== undefined} onOpenChange={open => (open ? undefined : onCancel())}>
      <AlertDialogContent>
         <AlertDialogHeader>
            <AlertDialogTitle>{mode === 'schedule' ? 'Plan this post?' : 'Post to LinkedIn now?'}</AlertDialogTitle>
            <AlertDialogDescription asChild>
               <div className="grid gap-3">
                  <p>
                     {mode === 'schedule'
                        ? `It is posted for real as ${account} ${plannedText ?? ''}. You can cancel it until it starts. ${reachText(audience, comments)}`
                        : `It is posted for real as ${account}. ${reachText(audience, comments)}`}
                  </p>
                  <p className="text-foreground rounded-md border px-3 py-2 text-sm" dir="auto">
                     {words}
                     {attachment ? <span className="text-muted-foreground block text-xs">{attachment}</span> : null}
                  </p>
                  <p>Once it is posted, it is deleted on LinkedIn, not here.</p>
               </div>
            </AlertDialogDescription>
         </AlertDialogHeader>
         <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm}>{mode === 'schedule' ? 'Plan it' : 'Post now'}</AlertDialogAction>
         </AlertDialogFooter>
      </AlertDialogContent>
   </AlertDialog>
)
