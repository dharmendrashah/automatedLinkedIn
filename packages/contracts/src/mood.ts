// The mood of a message read by rules, never by a model (.plan/workflow-events-and-hooks.md). It reads words, not intent.

export const MOODS = ['positive', 'negative', 'question', 'out_of_office', 'unsubscribe', 'neutral'] as const

export type Mood = (typeof MOODS)[number]

const RULES: { mood: Exclude<Mood, 'neutral'>; reason: string; pattern: RegExp }[] = [
   {
      mood: 'unsubscribe',
      reason: 'Asks not to be contacted again.',
      pattern:
         /\b(unsubscribe|remove me|take me off|stop (messaging|contacting|emailing|sending)|do not (contact|message)|don'?t (contact|message)|leave me alone)\b/,
   },
   {
      mood: 'out_of_office',
      reason: 'Reads like an automatic away reply.',
      pattern: /\b(out of (the )?office|auto-?reply|automatic reply|on (vacation|holiday|leave)|away until)\b/,
   },
   {
      mood: 'negative',
      reason: 'Words that mean no.',
      pattern:
         /\b(not interested|no thanks?|no thank you|not now|not a fit|not (looking|relevant)|isn'?t for me|pass on this|waste of (my )?time|spam)\b|^\s*no[.!]?\s*$/,
   },
   {
      mood: 'positive',
      reason: 'Words that show interest.',
      pattern:
         /\b(interested|sounds (good|great|interesting)|let'?s (talk|chat|connect|do it)|love to|happy to|would like to|send (me )?(more|details|info)|tell me more|book a|schedule a|set up a (call|meeting)|yes|sure|great idea)\b/,
   },
   {
      mood: 'question',
      reason: 'Asks something.',
      pattern: /\?|^\s*(how|what|when|where|why|who|which|can you|could you|do you|is this|are you)\b/,
   },
]

export const moodOf = (text: string): { mood: Mood; reason: string } => {
   const words = text.toLowerCase().replace(/[’‘]/g, "'")
   const found = RULES.find(({ pattern }) => pattern.test(words))

   return found
      ? {
           mood: found.mood,
           reason: found.reason,
        }
      : {
           mood: 'neutral',
           reason: 'No rule matched.',
        }
}
