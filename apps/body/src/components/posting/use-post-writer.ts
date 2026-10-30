import { useState } from 'react'
import { toast } from 'sonner'

import { attachmentRefusal, blocksOf, withAlt, withKey, withPhotos, withoutPhoto } from './draft'
import { type FileKind, fileProblem, storedName, totalProblem } from './files'
import { type Attachment, LIMITS, type PhotoItem } from './rules'
import { useAttachments } from './use-attachments'
import { useFileUrls } from './use-file-urls'
import { useUploads } from './use-uploads'

const unique = (problems: string[]) => [...new Set(problems)]

// The state of a post being written: its words, its one attachment, the files picked for it and their uploads. The Posting page and
// the "Write a post" block both write a post this way, and show it with the same `Composer`.
export const usePostWriter = (initial: { text: string; attachment: Attachment | undefined }) => {
   const [text, setText] = useState(initial.text)
   const [attachment, setAttachment] = useState<Attachment | undefined>(initial.attachment)
   const { files, attach, detach } = useAttachments()
   // A file is uploaded as soon as it is picked; when it is checked and kept, the post keeps where it is.
   const uploads = useUploads((fileId, uploaded) => setAttachment(current => withKey(current, fileId, uploaded)))
   const urls = useFileUrls(attachment, files)
   const uploading = Object.values(uploads.states).filter(({ status }) => status === 'uploading').length

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

   return {
      text,
      attachment,
      urls,
      uploading,
      blocks: blocksOf(text, attachment),
      // What `Composer` takes to edit the post.
      composer: {
         text,
         onText: setText,
         attachment,
         urls,
         uploads: uploads.states,
         onRetry: retry,
         onFiles: addFiles,
         onLink: addLink,
         onAttachAgain: attachAgain,
         onAlt: (photoId: string, alt: string) => setAttachment(current => withAlt(current, photoId, alt)),
         onRemovePhoto: (photoId: string) => {
            detach(photoId)
            uploads.forget(photoId)
            setAttachment(current => withoutPhoto(current, photoId))
         },
         onRemove: removeAttachment,
      },
   }
}
