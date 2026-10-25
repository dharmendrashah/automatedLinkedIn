// What a person types in the terminal while a session is being recorded. An empty line stops, as it always did; `s` keeps the page
// as it is now. Anything else is ignored with a hint, so a mistyped key never ends the recording.
export type RecordCommand = { kind: 'stop' } | { kind: 'snapshot' } | { kind: 'unknown'; line: string }

export const parseRecordCommand = (line: string): RecordCommand => {
   const text = line.trim().toLowerCase()

   if (text === '') {
      return { kind: 'stop' }
   }

   return ['s', 'snap', 'snapshot'].includes(text)
      ? { kind: 'snapshot' }
      : {
           kind: 'unknown',
           line: text,
        }
}

export const snapshotName = (count: number) => `snap-${count}`

// The page kept after a recorded step, named by the step so the two are found together.
export const stepSnapshotName = (step: number) => `step-${step}`
