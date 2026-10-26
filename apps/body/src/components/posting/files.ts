import { LIMITS } from './rules'

type Picked = {
   name: string
   size: number
}

export type FileKind = 'PHOTOS' | 'VIDEO' | 'DOCUMENT'

const TYPES: Record<FileKind, { types: string[]; max: number }> = {
   PHOTOS: {
      types: LIMITS.PHOTO_TYPES,
      max: LIMITS.PHOTO_BYTES,
   },
   VIDEO: {
      types: LIMITS.VIDEO_TYPES,
      max: LIMITS.VIDEO_BYTES,
   },
   DOCUMENT: {
      types: LIMITS.DOCUMENT_TYPES,
      max: LIMITS.DOCUMENT_BYTES,
   },
}

const accept = (types: string[]) => types.map(type => `.${type}`).join(',')

export const ACCEPT: Record<FileKind, string> = {
   PHOTOS: accept(TYPES.PHOTOS.types),
   VIDEO: accept(TYPES.VIDEO.types),
   DOCUMENT: accept(TYPES.DOCUMENT.types),
}

const extensionOf = (name: string) => /\.([A-Za-z0-9]{1,8})$/.exec(name)?.[1]?.toLowerCase()

// What a dropped file is by its name, or nothing for a type LinkedIn does not take.
export const kindOfFile = (name: string) => {
   const extension = extensionOf(name) ?? ''

   return (Object.keys(TYPES) as FileKind[]).find(kind => TYPES[kind].types.includes(extension))
}

export const formatBytes = (bytes: number) => {
   if (bytes < 1024) {
      return `${bytes} B`
   }

   const [value, unit] = bytes < 1024 * 1024 ? [bytes / 1024, 'KB'] : [bytes / (1024 * 1024), 'MB']

   return `${Number(value.toFixed(1))} ${unit}`
}

// What to take from files dropped together: those of the first kind that LinkedIn takes. The others are named in a sentence each.
export const splitDrop = <T extends { name: string }>(dropped: T[]) => {
   const kind = dropped.map(({ name }) => kindOfFile(name)).find(Boolean)
   const take = kind ? dropped.filter(({ name }) => kindOfFile(name) === kind) : []

   return {
      kind,
      take,
      problems: dropped
         .filter(file => !take.includes(file))
         .map(({ name }) =>
            kindOfFile(name)
               ? `${name} was not added: a post holds one kind of attachment.`
               : `${name} is not a type LinkedIn takes.`
         ),
   }
}

// Why a picked file cannot go in this block, in a sentence; nothing when it can.
export const fileProblem = (file: Picked, kind: FileKind) => {
   const { types, max } = TYPES[kind]

   if (!types.includes(extensionOf(file.name) ?? '')) {
      return `${file.name} is not a type LinkedIn takes here. Use ${types.join(', ')}.`
   }

   if (file.size === 0) {
      return `${file.name} is empty.`
   }

   return file.size > max ? `${file.name} is over ${formatBytes(max)}.` : undefined
}

// Why a file cannot join the files a post already holds, when that would pass the limit of all of them together.
export const totalProblem = (used: number, file: Picked) =>
   used + file.size > LIMITS.FILES_BYTES
      ? `${file.name} was not added: the files of a post can be at most ${formatBytes(LIMITS.FILES_BYTES)} together.`
      : undefined

// The name kept with the draft: no folder, at most 120 characters, the extension kept.
export const storedName = (name: string) => {
   const base = name.split(/[\\/]/).pop() ?? ''
   const extension = extensionOf(base)

   if (base.length <= 120 || extension === undefined) {
      return base.slice(0, 120)
   }

   return `${base.slice(0, 120 - extension.length - 1)}.${extension}`
}
