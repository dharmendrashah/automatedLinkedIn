import { type Application } from 'express'
import { Readable } from 'stream'

import { UploadFiles, UploadRefused } from 'core'

import { AuthService } from 'auth'

import { UserService } from 'database'

import { MAX_ATTACHMENT_BYTES, UPLOAD_ID, kindOfName, safeFileName } from '@automatedLinkedIn/contracts'

const readName = (header: string | undefined) => {
   try {
      return safeFileName(decodeURIComponent(header ?? ''))
   } catch {
      return ''
   }
}

// The address the page sends the files of a reply to, one file per call (.plan/unibox-send-attachments.md):
// POST /uploads/:uploadId with "Authorization: Bearer <token>", the file as the body and its name, encoded, in "X-File-Name". The upload id is
// made by the page and names the reply the files are for; the files are kept until the reply ends.
export class Uploads {
   public static config(app: Application) {
      app.post('/uploads/:uploadId', async (request, response) => {
         const token = AuthService.bearerToken(request.get('authorization'))
         const auth = token ? await AuthService.authenticate(token) : null
         const user = auth ? await UserService.findByAuthentikId(auth.sub) : null

         if (!user) {
            return response.status(401).json({ error: 'Sign in to send files.' })
         }

         const { uploadId } = request.params
         const name = readName(request.get('x-file-name'))

         if (!UPLOAD_ID.test(uploadId ?? '') || name === '') {
            return response.status(400).json({ error: 'The upload or the file name is not valid.' })
         }

         const kind = kindOfName(name)

         if (!kind) {
            return response.status(415).json({ error: 'This type of file cannot be sent.' })
         }

         if (Number(request.get('content-length') ?? 0) > MAX_ATTACHMENT_BYTES) {
            return response.status(413).json({ error: 'The file is larger than a reply may carry.' })
         }

         try {
            const saved = await UploadFiles.save(
               user.id,
               uploadId ?? '',
               name,
               request instanceof Readable ? request : Readable.from([])
            )

            return response.status(201).json({
               ...saved,
               kind,
            })
         } catch (error) {
            if (error instanceof UploadRefused) {
               return response.status(error.status).json({ error: error.message })
            }

            console.error(`Uploads: ${(error as Error).message}`)

            return response.status(500).json({ error: 'The file could not be kept. Try again.' })
         }
      })
   }
}
