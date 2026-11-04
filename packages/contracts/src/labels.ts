// Label with AI (.plan/lead-pipeline-p8-reading-blocks.md): the owner's labels are lines of "name: what it means". The name is a short
// word the next blocks branch on; the meaning is what the AI reads. Pure, so the block's check and the engine agree.

export const LABEL_LIMITS = {
   min: 2,
   max: 8,
   nameChars: 24,
   meaningChars: 120,
} as const

export type LabelDef = { name: string; meaning: string }

const LINE = /^([a-z0-9-]+)\s*:\s*(\S.*)$/i

export const parseLabel = (line: string): LabelDef | null => {
   const found = LINE.exec(line.trim())
   const name = found?.[1]?.toLowerCase() ?? ''
   const meaning = found?.[2]?.trim() ?? ''

   return name.length > 0 &&
      name.length <= LABEL_LIMITS.nameChars &&
      meaning.length > 0 &&
      meaning.length <= LABEL_LIMITS.meaningChars
      ? {
           name,
           meaning,
        }
      : null
}

// The reason the lines cannot be used, or null. Written for the person who types them.
export const labelsError = (lines: string[]): string | null => {
   if (lines.length < LABEL_LIMITS.min || lines.length > LABEL_LIMITS.max) {
      return `add ${LABEL_LIMITS.min} to ${LABEL_LIMITS.max} labels.`
   }

   const parsed = lines.map(parseLabel)

   if (parsed.some(label => label === null)) {
      return `write each label as name: what it means (a name of letters, digits or dashes up to ${LABEL_LIMITS.nameChars} characters, a meaning up to ${LABEL_LIMITS.meaningChars}).`
   }

   const names = parsed.flatMap(label => label?.name ?? [])

   return new Set(names).size === names.length ? null : 'each label name must be different.'
}

export const labelsOf = (lines: string[]): LabelDef[] => lines.flatMap(line => parseLabel(line) ?? [])
