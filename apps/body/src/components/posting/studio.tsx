import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { readableError } from '@/lib/trpc-error'
import { CalendarClock, ChevronLeft, Send } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'

import type { PostBlock } from '@automatedLinkedIn/contracts'

import { Composer } from './composer'
import { PostConfirmDialog } from './post-confirm-dialog'
import { PostPreview, type PreviewWidth } from './post-preview'
import { type Planned, ScheduleDialog } from './schedule-dialog'
import { summaryOf } from './summary'
import { identityOf, ineligibleReason } from './accounts'
import {
   attachmentRefusal,
   blocksOf,
   composerOf,
   isBlank,
   withAlt,
   withKey,
   withPhotos,
   withoutPhoto,
} from './draft'
import { type FileKind, fileProblem, storedName, totalProblem } from './files'
import { LIMITS, type Attachment, type PhotoItem } from './rules'
import { describePlanned } from './schedule'
import { useAttachments } from './use-attachments'
import { useAutosave } from './use-autosave'
import { useFileUrls } from './use-file-urls'
import { useUploads } from './use-uploads'

import { type Account } from '../accounts/types'
import { trpc } from '../../trpc'

export type Initial = {
   draftId: string | undefined
   accountId: string
   blocks: PostBlock[]
   planned: Planned | null
}

type Props = {
   initial: Initial
   accounts: Account[]
}

const SAVE_TEXT = {
   idle: '',
   saving: 'Saving…',
   saved: 'Saved as a draft',
   error: 'Not saved',
}

const unique = (problems: string[]) => [...new Set(problems)]

// The canvas: the post writer on the left, the post as LinkedIn will show it on the right. It saves itself as a draft.
export const Studio = ({ initial, accounts }: Props) => {
   const navigate = useNavigate()
   const utils = trpc.useUtils()
   const [accountId, setAccountId] = useState(initial.accountId)
   const [start] = useState(() => composerOf(initial.blocks))
   const [text, setText] = useState(start.text)
   const [attachment, setAttachment] = useState<Attachment | undefined>(start.attachment)
   const [planned, setPlanned] = useState(initial.planned)
   const [width, setWidth] = useState<PreviewWidth>('desktop')
   const [tab, setTab] = useState<'edit' | 'preview'>('edit')
   const [scheduling, setScheduling] = useState(false)
   const [confirming, setConfirming] = useState<'now' | 'schedule'>()
   const { files, attach, detach } = useAttachments()
   // A file is uploaded as soon as it is picked; when it is checked and kept, the draft keeps where it is.
   const uploads = useUploads((fileId, uploaded) => setAttachment(current => withKey(current, fileId, uploaded)))
   const urls = useFileUrls(attachment, files)
   const account = accounts.find(({ id }) => id === accountId)
   const profile = trpc.accountProfile.get.useQuery({ accountId }, { retry: false })
   const options = accounts
      .filter(({ id, status }) => id === accountId || status === 'ACTIVE')
      .map(({ id, email, displayName }) => ({
         id,
         label: displayName ?? email,
      }))

   const draftId = useRef(initial.draftId)
   const mounted = useRef(true)
   const first = useRef(true)
   const publish = trpc.postPublication.publish.useMutation()
   const schedule = trpc.postPublication.schedule.useMutation()
   const saveDraft = trpc.postDraft.save.useMutation()

   const autosave = useAutosave(async ({ blank, input }) => {
      if (draftId.current === undefined && blank) {
         return
      }

      const saved = await saveDraft.mutateAsync({
         ...input,
         id: draftId.current,
      })

      void utils.postDraft.list.invalidate()

      if (draftId.current === undefined) {
         draftId.current = saved.id

         // Only the address changes; this page stays as it is, so the files picked so far are not lost.
         if (mounted.current) {
            void navigate(`/posting/${saved.accountId}/${saved.id}`, { replace: true })
         }
      }
   })
   const { push } = autosave

   useEffect(() => {
      mounted.current = true

      return () => {
         mounted.current = false
      }
   }, [])

   useEffect(() => {
      if (first.current) {
         first.current = false

         return
      }

      push({
         blank: isBlank(text, attachment),
         input: {
            accountId,
            blocks: blocksOf(text, attachment),
            plannedAt: planned?.at ?? null,
            plannedZone: planned?.zone ?? null,
         },
      })
   }, [text, attachment, planned, accountId, push])

   if (!account) {
      return null
   }

   const identity = identityOf(account, profile.data?.profile)
   const refusal = ineligibleReason(account.status)
   const failure = saveDraft.error ? `Not saved: ${readableError(saveDraft.error)}` : SAVE_TEXT.error
   const uploading = Object.values(uploads.states).filter(({ status }) => status === 'uploading').length
   const saveText =
      autosave.state === 'error'
         ? failure
         : uploading > 0
           ? `Uploading ${uploading} ${uploading === 1 ? 'file' : 'files'}…`
           : SAVE_TEXT[autosave.state]
   const blocks = blocksOf(text, attachment)
   const sending = publish.isPending || schedule.isPending
   const blocker = refusal
      ? `This account cannot post now. ${refusal}`
      : isBlank(text, attachment)
        ? 'Write something first.'
        : uploading > 0
          ? 'Wait for the files to finish uploading.'
          : undefined

   // The draft is saved first, so what is posted is what is on the page; the copy brain makes is the post, and the draft is gone.
   const send = async () => {
      const mode = confirming

      setConfirming(undefined)

      if (!mode) {
         return
      }

      if (!(await autosave.flush()) || draftId.current === undefined) {
         toast.error('Your draft could not be saved, so nothing was sent.')

         return
      }

      try {
         if (mode === 'schedule') {
            await schedule.mutateAsync({ draftId: draftId.current })
         } else {
            await publish.mutateAsync({ draftId: draftId.current })
         }
      } catch (error) {
         toast.error(error instanceof Error ? readableError(error) : 'It could not be sent.')

         return
      }

      void utils.postDraft.list.invalidate()
      void utils.postPublication.list.invalidate()
      toast(mode === 'schedule' ? 'Post planned' : 'Post sent for posting')
      void navigate('/posting')
   }

   const changeAccount = (next: string) => {
      setAccountId(next)
      void navigate(draftId.current ? `/posting/${next}/${draftId.current}` : `/posting/${next}`, { replace: true })
   }

   const addPhotos = (picked: File[]) => {
      let room = LIMITS.PHOTOS - (attachment?.type === 'PHOTOS' ? attachment.items.length : 0)
      let used = attachment?.type === 'PHOTOS' ? attachment.items.reduce((sum, { bytes }) => sum + bytes, 0) : 0
      const added: PhotoItem[] = []
      const problems: string[] = []

      for (const file of picked) {
         const problem = fileProblem(file, 'PHOTOS') ?? (room > 0 ? totalProblem(used, file) : undefined)

         if (problem) {
            problems.push(problem)
         } else if (room <= 0) {
            problems.push(`A post can hold ${LIMITS.PHOTOS} photos.`)
         } else {
            const id = crypto.randomUUID()

            attach(id, file)
            void uploads.start(id, file)
            added.push({
               id,
               name: storedName(file.name),
               bytes: file.size,
            })
            room -= 1
            used += file.size
         }
      }

      const blockId = crypto.randomUUID()

      setAttachment(current => withPhotos(current, added, blockId))

      return unique(problems)
   }

   const addFiles = (kind: FileKind, picked: File[]) => {
      const refused = attachmentRefusal(attachment, kind)

      if (refused) {
         return [refused]
      }

      if (kind === 'PHOTOS') {
         return addPhotos(picked)
      }

      const [file, ...others] = picked

      if (!file) {
         return []
      }

      const problem = fileProblem(file, kind)

      if (problem) {
         return [problem]
      }

      if (attachment?.type === 'VIDEO' || attachment?.type === 'DOCUMENT') {
         detach(attachment.file.id)
         uploads.forget(attachment.file.id)
      }

      const ref = {
         id: crypto.randomUUID(),
         name: storedName(file.name),
         bytes: file.size,
      }

      // The copy on this device is shown at once and is what a retry sends again.
      attach(ref.id, file)
      void uploads.start(ref.id, file)

      setAttachment({
         id: crypto.randomUUID(),
         type: kind,
         file: ref,
      })

      return others.length > 0 ? [`Only one ${kind === 'VIDEO' ? 'video' : 'document'} fits in a post.`] : []
   }

   const addLink = (url: string) => {
      const refused = attachmentRefusal(attachment, 'LINK')

      if (refused) {
         toast.error(refused)

         return
      }

      if (attachment?.type === 'LINK') {
         toast('The link of the post was replaced.')
      }

      setAttachment({
         id: crypto.randomUUID(),
         type: 'LINK',
         url,
      })
   }

   const attachAgain = (id: string, kind: 'PHOTOS' | 'VIDEO', file: File) => {
      const problem = fileProblem(file, kind)

      if (problem) {
         return [problem]
      }

      attach(id, file)
      void uploads.start(id, file)

      return []
   }

   const retry = (id: string) => {
      const local = files.get(id)

      if (local) {
         void uploads.start(id, local.file)
      }
   }

   const removeAttachment = () => {
      if (attachment?.type === 'VIDEO' || attachment?.type === 'DOCUMENT') {
         detach(attachment.file.id)
         uploads.forget(attachment.file.id)
      }

      setAttachment(undefined)
   }

   return (
      <div className="grid w-full gap-4 px-4 lg:px-6">
         <div className="flex flex-wrap items-center justify-between gap-3">
            <Button asChild variant="ghost" size="sm">
               <Link to="/posting">
                  <ChevronLeft />
                  All drafts and accounts
               </Link>
            </Button>
            <ToggleGroup
               type="single"
               value={tab}
               onValueChange={value => setTab(value === 'preview' ? 'preview' : 'edit')}
               variant="outline"
               className="lg:hidden"
               aria-label="Show"
            >
               <ToggleGroupItem value="edit">Write</ToggleGroupItem>
               <ToggleGroupItem value="preview">Preview</ToggleGroupItem>
            </ToggleGroup>
         </div>

         {refusal ? (
            <Alert>
               <AlertDescription>This account cannot post now. {refusal}</AlertDescription>
            </Alert>
         ) : null}

         <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
            <div className={tab === 'preview' ? 'hidden lg:block' : undefined}>
               <Composer
                  identity={identity}
                  accounts={options}
                  accountId={accountId}
                  onAccount={changeAccount}
                  text={text}
                  onText={setText}
                  attachment={attachment}
                  urls={urls}
                  uploads={uploads.states}
                  onRetry={retry}
                  onFiles={addFiles}
                  onLink={addLink}
                  onAttachAgain={attachAgain}
                  onAlt={(photoId, alt) => setAttachment(current => withAlt(current, photoId, alt))}
                  onRemovePhoto={photoId => {
                     detach(photoId)
                     uploads.forget(photoId)
                     setAttachment(current => withoutPhoto(current, photoId))
                  }}
                  onRemove={removeAttachment}
                  footer={
                     <>
                        <p role="status" className="text-muted-foreground flex items-center gap-2 text-sm">
                           {saveText}
                           {autosave.state === 'error' ? (
                              <Button
                                 type="button"
                                 variant="link"
                                 size="sm"
                                 className="h-auto p-0"
                                 onClick={() => void autosave.retry()}
                              >
                                 Try again
                              </Button>
                           ) : null}
                        </p>
                        <div className="flex items-center gap-2">
                           <Button type="button" variant="ghost" onClick={() => setScheduling(true)}>
                              <CalendarClock />
                              {planned ? describePlanned(planned.at, planned.zone) : 'Plan a time'}
                           </Button>
                           <Button
                              type="button"
                              variant="outline"
                              disabled={Boolean(blocker) || sending || !planned}
                              title={blocker ?? (planned ? undefined : 'Plan a time first.')}
                              onClick={() => setConfirming('schedule')}
                           >
                              <CalendarClock />
                              Schedule
                           </Button>
                           <Button
                              type="button"
                              disabled={Boolean(blocker) || sending}
                              title={blocker}
                              onClick={() => setConfirming('now')}
                           >
                              <Send />
                              Post now
                           </Button>
                        </div>
                     </>
                  }
               />
            </div>
            <div className={tab === 'edit' ? 'hidden gap-3 lg:sticky lg:top-4 lg:grid' : 'grid gap-3 lg:sticky lg:top-4'}>
               <div className="flex items-center justify-between gap-2">
                  <p className="text-muted-foreground text-xs">Preview. LinkedIn may fold long text a little differently.</p>
                  <ToggleGroup
                     type="single"
                     size="sm"
                     variant="outline"
                     value={width}
                     onValueChange={value => setWidth(value === 'mobile' ? 'mobile' : 'desktop')}
                     aria-label="Preview width"
                  >
                     <ToggleGroupItem value="desktop">Desktop</ToggleGroupItem>
                     <ToggleGroupItem value="mobile">Mobile</ToggleGroupItem>
                  </ToggleGroup>
               </div>
               <PostPreview identity={identity} blocks={blocks} urls={urls} width={width} />
               {identity.known ? null : (
                  <p className="text-muted-foreground text-xs">
                     This account's name and photo are not known yet.{' '}
                     <Link className="underline underline-offset-4" to={`/accounts/${accountId}`}>
                        Read its profile
                     </Link>{' '}
                     to see them here.
                  </p>
               )}
            </div>
         </div>

         <ScheduleDialog
            open={scheduling}
            onOpenChange={setScheduling}
            current={planned}
            onSave={setPlanned}
            onClear={() => setPlanned(null)}
         />
         <PostConfirmDialog
            mode={confirming}
            account={account.displayName ?? account.email}
            words={summaryOf(blocks).words}
            attachment={summaryOf(blocks).attachment}
            plannedText={planned ? describePlanned(planned.at, planned.zone) : undefined}
            onConfirm={() => void send()}
            onCancel={() => setConfirming(undefined)}
         />
      </div>
   )
}
