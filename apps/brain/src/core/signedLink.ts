import type { File } from '@google-cloud/storage'

import { extensionOf } from '@automatedLinkedIn/contracts'

// A link works for this long; the page asks for a new one when it is about to end.
const LINK_TTL_MS = 10 * 60 * 1000

// Only pictures a browser draws are shown in the page; everything else is a download, with a neutral type.
const PICTURES: Record<string, string> = {
   png: 'image/png',
   jpg: 'image/jpeg',
   jpeg: 'image/jpeg',
   gif: 'image/gif',
   webp: 'image/webp',
}

// A signed link that reads one object of the bucket: a picture is shown inline, anything else is a download.
export const readLink = async (file: Pick<File, 'getSignedUrl'>, name: string) => {
   const picture = PICTURES[extensionOf(name) ?? '']
   const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + LINK_TTL_MS,
      responseType: picture ?? 'application/octet-stream',
      responseDisposition: `${picture ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`,
   })

   return url
}
