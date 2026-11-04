// Why a draft was rejected, as the inbox words it; the keys are what the API takes.
export const REJECT_REASONS = {
   OFF_TOPIC: 'Off topic',
   TOO_GENERIC: 'Too generic',
   WRONG_TONE: 'Wrong tone',
   SENSITIVE: 'Sensitive post',
   OTHER: 'Other',
} as const

export type RejectReason = keyof typeof REJECT_REASONS
