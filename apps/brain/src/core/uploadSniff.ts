import { extensionOf } from '@automatedLinkedIn/contracts'

// Whether the first bytes of a file are what its extension says it is, so a program renamed to .pdf, or a page of script renamed to .png,
// does not go to a conversation as one. Only the types the uploads accept are known; a type not listed here is never accepted.
const at = (head: Buffer, offset: number, text: string) =>
   head.subarray(offset, offset + text.length).toString('latin1') === text
const bytes = (head: Buffer, ...values: number[]) => values.every((value, index) => head[index] === value)

const ZIP = (head: Buffer) => bytes(head, 0x50, 0x4b, 0x03, 0x04)
const OLE = (head: Buffer) => bytes(head, 0xd0, 0xcf, 0x11, 0xe0)
const QUICKTIME = (head: Buffer) => ['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip'].some(box => at(head, 4, box))
// Plain text has no NUL byte; the first bytes of a text file are a sample, never a guarantee.
const TEXT = (head: Buffer) => !head.includes(0)

const CHECKS: Record<string, (head: Buffer) => boolean> = {
   png: head => bytes(head, 0x89, 0x50, 0x4e, 0x47),
   jpg: head => bytes(head, 0xff, 0xd8, 0xff),
   jpeg: head => bytes(head, 0xff, 0xd8, 0xff),
   gif: head => at(head, 0, 'GIF8'),
   webp: head => at(head, 0, 'RIFF') && at(head, 8, 'WEBP'),
   pdf: head => at(head, 0, '%PDF'),
   ai: head => at(head, 0, '%PDF') || at(head, 0, '%!PS'),
   psd: head => at(head, 0, '8BPS'),
   docx: ZIP,
   pptx: ZIP,
   ppsx: ZIP,
   xlsx: ZIP,
   doc: OLE,
   ppt: OLE,
   pps: OLE,
   xls: OLE,
   mp4: QUICKTIME,
   mov: QUICKTIME,
   m4a: head => at(head, 4, 'ftyp'),
   mp3: head => at(head, 0, 'ID3') || (head[0] === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0),
   wav: head => at(head, 0, 'RIFF') && at(head, 8, 'WAVE'),
   txt: TEXT,
   eml: TEXT,
}

// How many bytes at the start of a file are enough to tell.
export const HEAD_BYTES = 16

export const looksLike = (name: string, head: Buffer) => {
   const extension = extensionOf(name)
   const check = extension === undefined ? undefined : CHECKS[extension]

   return check !== undefined && head.length > 0 && check(head)
}
