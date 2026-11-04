// What "If person state" can ask about a person (.plan/lead-pipeline-p2-checks.md): one table shared by the block's settings, its checks
// and the engine. Every fact is computed from what is stored; none opens LinkedIn.

export type PersonFactKind = 'bool' | 'number' | 'choice' | 'text'

// Which stored read a fact depends on: the connections of an account, or its messages. A fact whose read is missing or too old is not known.
export type PersonFactRead = 'connections' | 'messages'

export type PersonFact = {
   key: string
   label: string
   group: 'Connection' | 'Invite' | 'Chat' | 'Person'
   kind: PersonFactKind
   options?: Array<{ value: string; label: string }>
   needs?: PersonFactRead
}

const INVITE_STATES = [
   {
      value: 'none',
      label: 'None',
   },
   {
      value: 'queued',
      label: 'Queued',
   },
   {
      value: 'pending',
      label: 'Pending',
   },
   {
      value: 'accepted',
      label: 'Accepted',
   },
   {
      value: 'ended',
      label: 'Withdrawn or ended',
   },
]

const STATUSES = [
   {
      value: 'new',
      label: 'New',
   },
   {
      value: 'contacted',
      label: 'Contacted',
   },
   {
      value: 'replied',
      label: 'Replied',
   },
   {
      value: 'not_interested',
      label: 'Not interested',
   },
   {
      value: 'done',
      label: 'Done',
   },
]

export const PERSON_FACTS: PersonFact[] = [
   {
      key: 'connected',
      label: 'Connected to an account',
      group: 'Connection',
      kind: 'bool',
      needs: 'connections',
   },
   {
      key: 'connectedCount',
      label: 'Connected to how many accounts',
      group: 'Connection',
      kind: 'number',
      needs: 'connections',
   },
   {
      key: 'connectedDays',
      label: 'Days since they connected',
      group: 'Connection',
      kind: 'number',
      needs: 'connections',
   },
   {
      key: 'inviteState',
      label: 'Our invite is',
      group: 'Invite',
      kind: 'choice',
      options: INVITE_STATES,
   },
   {
      key: 'invitePendingDays',
      label: 'Days the invite has been pending',
      group: 'Invite',
      kind: 'number',
   },
   {
      key: 'chatStored',
      label: 'We have a stored chat with them',
      group: 'Chat',
      kind: 'bool',
      needs: 'messages',
   },
   {
      key: 'wroteTo',
      label: 'We have written to them',
      group: 'Chat',
      kind: 'bool',
      needs: 'messages',
   },
   {
      key: 'theyWrote',
      label: 'They have written to us',
      group: 'Chat',
      kind: 'bool',
      needs: 'messages',
   },
   {
      key: 'waiting',
      label: 'We wrote last and no answer came',
      group: 'Chat',
      kind: 'bool',
   },
   {
      key: 'daysSinceWrote',
      label: 'Days since our last message',
      group: 'Chat',
      kind: 'number',
   },
   {
      key: 'daysSinceTheyWrote',
      label: 'Days since their last message',
      group: 'Chat',
      kind: 'number',
   },
   {
      key: 'doNotContact',
      label: 'On Do not contact',
      group: 'Person',
      kind: 'bool',
   },
   {
      key: 'status',
      label: 'Status',
      group: 'Person',
      kind: 'choice',
      options: STATUSES,
   },
   {
      key: 'label',
      label: 'Has the label',
      group: 'Person',
      kind: 'text',
   },
   {
      key: 'score',
      label: 'Score',
      group: 'Person',
      kind: 'number',
   },
   {
      key: 'profileRead',
      label: 'Profile was read',
      group: 'Person',
      kind: 'bool',
   },
   {
      key: 'hasEmail',
      label: 'Has a work email',
      group: 'Person',
      kind: 'bool',
   },
]

export const PERSON_OPERATORS = ['is', 'isNot', 'atLeast', 'atMost', 'has', 'hasNot', 'known', 'unknown'] as const

export type PersonOperator = (typeof PERSON_OPERATORS)[number]

export const PERSON_OPERATOR_LABELS: Record<PersonOperator, string> = {
   is: 'is',
   isNot: 'is not',
   atLeast: 'is at least',
   atMost: 'is at most',
   has: 'has',
   hasNot: 'has not',
   known: 'is known',
   unknown: 'is not known',
}

export const PERSON_OPERATORS_BY_KIND: Record<PersonFactKind, PersonOperator[]> = {
   bool: ['is', 'isNot', 'known', 'unknown'],
   number: ['atLeast', 'atMost', 'is', 'known', 'unknown'],
   choice: ['is', 'isNot', 'known', 'unknown'],
   text: ['has', 'hasNot'],
}

export const personFactOf = (key: string) => PERSON_FACTS.find(fact => fact.key === key)

// What a fact is for one person; null when it is not known.
export type PersonFactValue = boolean | number | string | string[] | null

export type PersonCondition = { fact: string; op: PersonOperator; value: string }

export type PersonCheck = 'match' | 'no' | 'unknown'

const valueIs = (got: PersonFactValue, value: string) =>
   typeof got === 'boolean'
      ? (got ? 'yes' : 'no') === value
      : typeof got === 'number'
        ? got === Number(value)
        : got === value

// A fact that is not known matches neither "is" nor "is not" (the rule of "If the event says"); only "is not known" finds it.
export const checkPerson = (condition: PersonCondition, facts: Record<string, PersonFactValue>): PersonCheck => {
   const got = facts[condition.fact] ?? null
   const { op, value } = condition

   if (op === 'unknown') {
      return got === null ? 'match' : 'no'
   }

   if (op === 'known') {
      return got === null ? 'no' : 'match'
   }

   if (got === null) {
      return 'unknown'
   }

   if (op === 'has' || op === 'hasNot') {
      const held = Array.isArray(got) ? got.includes(value) : got === value

      return held === (op === 'has') ? 'match' : 'no'
   }

   if (op === 'atLeast' || op === 'atMost') {
      const number = Number(value)

      if (typeof got !== 'number' || Number.isNaN(number)) {
         return 'no'
      }

      return (op === 'atLeast' ? got >= number : got <= number) ? 'match' : 'no'
   }

   return valueIs(got, value) === (op === 'is') ? 'match' : 'no'
}

// The sentence an Else person carries when a check did not hold, or could not be answered. Never the person's data.
export const personReason = (fact: PersonFact | undefined, check: Exclude<PersonCheck, 'match'>) => {
   if (check === 'unknown') {
      return fact?.needs === 'connections'
         ? "Not known: read the account's connections first."
         : fact?.needs === 'messages'
           ? "Not known: read the account's conversations first."
           : 'Not known.'
   }

   return fact ? `Did not match: ${fact.label}.` : 'Did not match.'
}

export const PERSON_CHECK_ROWS = 3

// A row of the block: `check`, `op` and `value` for row 1, then `check2`, `op2`, `value2`.
export const personRowKey = (name: 'check' | 'op' | 'value', row: number) => (row === 1 ? name : `${name}${row}`)

export const personConditionsOf = (config: Record<string, unknown>): PersonCondition[] =>
   Array.from({ length: PERSON_CHECK_ROWS }, (_unused, index) => index + 1).flatMap((row): PersonCondition[] => {
      const fact = config[personRowKey('check', row)]
      const op = config[personRowKey('op', row)]
      const value = config[personRowKey('value', row)]
      const known = typeof fact === 'string' ? personFactOf(fact) : undefined
      const operator = PERSON_OPERATORS.find(each => each === op)

      return known && operator && PERSON_OPERATORS_BY_KIND[known.kind].includes(operator)
         ? [
              {
                 fact: known.key,
                 op: operator,
                 value: typeof value === 'string' ? value : '',
              },
           ]
         : []
   })
