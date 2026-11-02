// The words of an invite note, a message or a reply (.plan/message-composer.md): variables filled from what we know about the person,
// spintax to vary the words, and a fallback for a value we do not have. Pure, so the editor's preview, the checks and the send all use it.
//
//   {first_name}          a variable
//   {first_name:there}    a variable, with the words to use when it is empty
//   {Hi|Hello|Hey}        one of the options, picked at random each time; options nest and may hold variables
//   \{ and \}             a brace written as it is

// What may be saved: the text holds every option, so it is longer than any one version that goes out (those are checked on their own).
export const TEMPLATE_RAW_MAX = {
   note: 1_000,
   text: 12_000,
} as const

export type TemplateValues = Partial<Record<string, string | null | undefined>>

export type TemplateVariable = {
   key: string
   label: string
   group: 'Person' | 'Work' | 'Activity' | 'Time' | 'You'
   example: string
   // Where the value comes from, in one sentence.
   source: string
}

const variable = (
   key: string,
   group: TemplateVariable['group'],
   label: string,
   example: string,
   source: string
): TemplateVariable => ({
   key,
   group,
   label,
   example,
   source,
})

export const TEMPLATE_VARIABLES: readonly TemplateVariable[] = [
   variable('first_name', 'Person', 'First name', 'Ada', 'Their name on My network'),
   variable('last_name', 'Person', 'Last name', 'Lovelace', 'Their name on My network'),
   variable('full_name', 'Person', 'Full name', 'Ada Lovelace', 'Their name on My network'),
   variable('headline', 'Person', 'Headline', 'Founder at Analytical Engines', 'Their headline'),
   variable('location', 'Person', 'Location', 'London, United Kingdom', 'Their full profile, or the list they are in'),
   variable(
      'about_snippet',
      'Person',
      'First sentence of their about',
      'I write programs for engines.',
      'Their full profile'
   ),
   variable('top_skill', 'Person', 'Top skill', 'Mathematics', 'Their full profile'),
   variable('school', 'Person', 'School', 'University of London', 'Their full profile'),
   variable('company', 'Work', 'Current company', 'Analytical Engines', 'Their profile or the list they are in'),
   variable('title', 'Work', 'Current title', 'Founder', 'Their profile or the list they are in'),
   variable('previous_company', 'Work', 'Previous company', 'Babbage and Co', 'Their full profile'),
   variable('previous_title', 'Work', 'Previous title', 'Mathematician', 'Their full profile'),
   variable(
      'commented_on',
      'Activity',
      'Whose post they commented on',
      'Charles Babbage',
      'A comment a workflow found'
   ),
   variable(
      'comment_excerpt',
      'Activity',
      'Their comment, shortened',
      'Great point on punch cards',
      'A comment a workflow found'
   ),
   variable('reacted_to', 'Activity', 'Whose post they reacted to', 'Charles Babbage', 'A reaction a workflow found'),
   variable(
      'their_note',
      'Activity',
      'What they wrote with their request',
      'Hi, I enjoyed your talk.',
      'Their connection request'
   ),
   variable('connected_date', 'Time', 'Date you connected', '12 Oct 2026', 'My network'),
   variable('connected_ago', 'Time', 'How long ago you connected', '3 weeks ago', 'My network'),
   variable('commented_date', 'Time', 'Date they commented', '20 Oct 2026', 'A comment a workflow found'),
   variable('commented_ago', 'Time', 'How long ago they commented', '5 days ago', 'A comment a workflow found'),
   variable('reacted_date', 'Time', 'Date they reacted', '21 Oct 2026', 'A reaction a workflow found'),
   variable('reacted_ago', 'Time', 'How long ago they reacted', '4 days ago', 'A reaction a workflow found'),
   variable('account_first_name', 'You', 'First name of the sending account', 'Sam', 'The account that writes'),
]

const KNOWN = new Set(TEMPLATE_VARIABLES.map(({ key }) => key))

export const TEMPLATE_EXAMPLE_VALUES: Record<string, string> = Object.fromEntries(
   TEMPLATE_VARIABLES.map(({ key, example }) => [key, example])
)

type Node =
   { t: 'text'; v: string } | { t: 'var'; key: string; fallback: string | null } | { t: 'pick'; options: Node[][] }

const NOT_A_GROUP = 'Write a variable name like {first_name}, or options like {Hi|Hello}.'

const parse = (text: string) => {
   const problems: string[] = []
   let at = 0

   const sequence = (inGroup: boolean): Node[] => {
      const nodes: Node[] = []
      let buffer = ''
      const flush = () => {
         if (buffer !== '') {
            nodes.push({
               t: 'text',
               v: buffer,
            })
            buffer = ''
         }
      }

      while (at < text.length) {
         const char = text.charAt(at)

         if (char === '\\' && at + 1 < text.length) {
            buffer += text.charAt(at + 1)
            at += 2
         } else if (char === '{') {
            flush()
            at += 1
            nodes.push(group())
         } else if (inGroup && (char === '|' || char === '}')) {
            break
         } else {
            if (char === '}') {
               problems.push('A } has no { before it.')
            }

            buffer += char
            at += 1
         }
      }

      flush()

      return nodes
   }

   const group = (): Node => {
      const options: Node[][] = []

      for (;;) {
         options.push(sequence(true))

         if (text.charAt(at) === '|') {
            at += 1
         } else if (text.charAt(at) === '}') {
            at += 1
            break
         } else {
            problems.push('A { is not closed.')

            return {
               t: 'text',
               v: '',
            }
         }
      }

      if (options.length > 1) {
         return {
            t: 'pick',
            options,
         }
      }

      const [only = []] = options
      const [single] = only
      const raw = only.length === 1 && single?.t === 'text' ? single.v : null
      const named = raw === null ? null : /^\s*([a-z_]+)\s*(?::([\s\S]*))?$/.exec(raw)

      if (!named?.[1]) {
         problems.push(NOT_A_GROUP)

         return {
            t: 'text',
            v: '',
         }
      }

      return {
         t: 'var',
         key: named[1],
         fallback: named[2] === undefined ? null : named[2].trim(),
      }
   }

   const nodes = sequence(false)

   return {
      nodes,
      problems: [...new Set(problems)],
   }
}

const walk = (nodes: Node[], visit: (node: Node) => void) => {
   for (const node of nodes) {
      visit(node)

      if (node.t === 'pick') {
         node.options.forEach(option => walk(option, visit))
      }
   }
}

// The variables a text uses, once each, in the order they appear; an unknown name is listed too.
export const usedVariables = (text: string) => {
   const found: string[] = []

   walk(parse(text).nodes, node => {
      if (node.t === 'var' && !found.includes(node.key)) {
         found.push(node.key)
      }
   })

   return found
}

const tidy = (text: string) =>
   text
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/ +([,.!?;:])/g, '$1')
      .replace(/[ \t]+\n/g, '\n')
      .trim()

// The value of a variable: its own, else the fallback written in the text. null when there is neither.
const valueOf = (node: { key: string; fallback: string | null }, values: TemplateValues) => {
   const own = values[node.key]?.trim()

   return own ? own : node.fallback
}

const draw = (nodes: Node[], values: TemplateValues, random: () => number, missing: Set<string>): string =>
   nodes
      .map(node => {
         if (node.t === 'text') {
            return node.v
         }

         if (node.t === 'var') {
            const value = valueOf(node, values)

            if (value === null) {
               missing.add(node.key)
            }

            return value ?? ''
         }

         const chosen =
            node.options[Math.min(node.options.length - 1, Math.floor(random() * node.options.length))] ?? []

         return draw(chosen, values, random, missing)
      })
      .join('')

// One version of the text with the values in and the options picked at random. `missing` lists the variables with no value and no fallback.
export const renderTemplate = (text: string, values: TemplateValues, random: () => number = Math.random) => {
   const missing = new Set<string>()
   const rendered = tidy(draw(parse(text).nodes, values, random, missing))

   return {
      text: rendered,
      missing: [...missing],
   }
}

const LIMIT = 1_000_000

// Every version the options can make, each once, up to `limit`.
export const renderAll = (text: string, values: TemplateValues, limit = 50): string[] => {
   const expand = (nodes: Node[]): string[] =>
      nodes.reduce<string[]>(
         (before, node) => {
            const part =
               node.t === 'text'
                  ? [node.v]
                  : node.t === 'var'
                    ? [valueOf(node, values) ?? '']
                    : [...new Set(node.options.flatMap(option => expand(option)))]
            const next: string[] = []

            for (const head of before) {
               for (const tail of part) {
                  if (next.length >= limit) {
                     return next
                  }

                  next.push(head + tail)
               }
            }

            return next
         },
         ['']
      )

   return [...new Set(expand(parse(text).nodes).map(tidy))].slice(0, limit)
}

// How many ways the options can combine; stops growing at a million.
export const countVariants = (text: string) => {
   const count = (nodes: Node[]): number =>
      nodes.reduce(
         (total, node) =>
            node.t === 'pick'
               ? Math.min(
                    LIMIT,
                    total *
                       Math.min(
                          LIMIT,
                          node.options.reduce((sum, option) => sum + count(option), 0)
                       )
                 )
               : total,
         1
      )

   return count(parse(text).nodes)
}

// What is wrong with a text, in plain words; none when it is good. With `maxChars` the longest version, filled with example values, is
// checked too (the editor does not know the real people).
export const templateProblems = (text: string, options: { maxChars?: number } = {}) => {
   const { nodes, problems } = parse(text)
   const found = [...problems]

   walk(nodes, node => {
      if (node.t === 'var' && !KNOWN.has(node.key)) {
         found.push(`{${node.key}} is not a variable. Pick one from the list.`)
      }
   })

   if (found.length === 0 && options.maxChars !== undefined) {
      const longest = Math.max(0, ...renderAll(text, TEMPLATE_EXAMPLE_VALUES, 500).map(version => version.length))

      if (longest > options.maxChars) {
         found.push(`The longest version is ${longest} characters, over the ${options.maxChars} allowed.`)
      }
   }

   return [...new Set(found)]
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const dateOf = (value: Date | string) => {
   const date = new Date(value)

   return Number.isNaN(date.getTime()) ? null : date
}

const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? '' : 's'} ago`

// "3 weeks ago", "yesterday", "just now". null for a date that does not read.
export const humanAgo = (value: Date | string, now = new Date()) => {
   const date = dateOf(value)

   if (!date) {
      return null
   }

   const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000))
   const minutes = Math.floor(seconds / 60)
   const hours = Math.floor(minutes / 60)
   const days = Math.floor(hours / 24)

   if (seconds < 60) {
      return 'just now'
   }

   if (minutes < 60) {
      return plural(minutes, 'minute')
   }

   if (hours < 24) {
      return plural(hours, 'hour')
   }

   if (days === 1) {
      return 'yesterday'
   }

   if (days < 14) {
      return plural(days, 'day')
   }

   if (days < 60) {
      return plural(Math.floor(days / 7), 'week')
   }

   return days < 365 ? plural(Math.floor(days / 30), 'month') : plural(Math.floor(days / 365), 'year')
}

// "12 Oct 2026", in UTC. null for a date that does not read.
export const humanDate = (value: Date | string) => {
   const date = dateOf(value)

   return date ? `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}` : null
}

export type MessageUse = 'invite' | 'message' | 'reply'

export type MessageSample = { id: string; use: MessageUse; title: string; text: string }

const sample = (use: MessageUse, id: string, title: string, text: string): MessageSample => ({
   id: `${use}-${id}`,
   use,
   title,
   text,
})

// Short, generic starting points: pick one, then change the words. Every one is written to read well when a value is missing.
export const MESSAGE_SAMPLES: readonly MessageSample[] = [
   sample(
      'invite',
      'simple',
      'Simple hello',
      "{Hi|Hello|Hey} {first_name:there}, {I'd like|I'd love|Would love} to connect."
   ),
   sample(
      'invite',
      'work',
      'Their company',
      '{Hi|Hello} {first_name:there}, {saw|noticed} your work at {company:your company}. {Would be great|Would love} to connect.'
   ),
   sample(
      'invite',
      'role',
      'Their role',
      "{Hi|Hey} {first_name:there}, your role as {title:a leader} at {company:your company} {caught my eye|looks interesting}. {Let's connect|Happy to connect}?"
   ),
   sample(
      'invite',
      'headline',
      'Their headline',
      "{Hi|Hello} {first_name:there}, your profile {stood out|caught my attention}. {Let's connect|Happy to connect}."
   ),
   sample(
      'invite',
      'comment',
      'Their comment',
      "{Hi|Hello} {first_name:there}, {enjoyed|liked} your comment {commented_ago:recently}. {Let's connect|Would love to connect}."
   ),
   sample(
      'invite',
      'reaction',
      'Their reaction',
      "{Hi|Hello} {first_name:there}, I saw you {liked|reacted to} a post by {reacted_to:someone I follow}. {Let's connect|Would love to connect}."
   ),
   sample(
      'invite',
      'previous',
      'Their earlier job',
      "{Hi|Hello} {first_name:there}, I see you were at {previous_company:a great company} before. {Would love to connect|Let's connect}."
   ),
   sample(
      'invite',
      'skill',
      'Their skill',
      "{Hi|Hello} {first_name:there}, I {see|noticed} you know {top_skill:your field} well. {Let's connect|Would love to connect}."
   ),
   sample(
      'invite',
      'school',
      'Their school',
      "{Hi|Hello} {first_name:there}, I {saw|noticed} you studied at {school:university}. {Let's connect|Would love to connect}."
   ),
   sample(
      'invite',
      'quick',
      'Quick note',
      '{Hi|Hey} {first_name:there}, {quick|short} note to connect. {Cheers|Thanks}!'
   ),
   sample('invite', 'friendly', 'Friendly', "{Hello|Hi} {first_name:there}! {Let's connect|Would be glad to connect}."),
   sample(
      'invite',
      'place',
      'Their place',
      "{Hi|Hello} {first_name:there}, {I see you are in|you are based in} {location:the same field}. {Let's connect|Happy to connect}."
   ),
   sample(
      'message',
      'thanks',
      'Thanks for connecting',
      '{Hi|Hello|Hey} {first_name:there}, {thanks for connecting|great to be connected}!'
   ),
   sample(
      'message',
      'thanks-ago',
      'Thanks, with when',
      '{Hi|Hello} {first_name:there}, {thanks for connecting|glad we connected} {connected_ago:recently}.'
   ),
   sample(
      'message',
      'company',
      'Ask about work',
      "{Hi|Hello} {first_name:there}, {how is|how's} work at {company:your company} {going|treating you}?"
   ),
   sample(
      'message',
      'question',
      'One question',
      "{Hi|Hello} {first_name:there}, {a quick question|quick question}: {what are you focused on|what's your main focus} {this quarter|right now}?"
   ),
   sample(
      'message',
      'role',
      'Ask about their role',
      '{Hi|Hello} {first_name:there}, {curious|keen to know} what a typical week looks like as {title:a leader} at {company:your company}.'
   ),
   sample(
      'message',
      'comment',
      'Their comment',
      '{Hi|Hello} {first_name:there}, {I liked|I loved|I enjoyed} your comment {commented_ago:recently}. {Can we continue it here|Do you have a minute to chat}?'
   ),
   sample(
      'message',
      'excerpt',
      'Quote their comment',
      '{Hi|Hello} {first_name:there}, {comment_excerpt:your comment} {stayed with me|made me think}.'
   ),
   sample(
      'message',
      'previous',
      'Their earlier job',
      '{Hi|Hello} {first_name:there}, {I noticed|I saw} you {worked|were} at {previous_company:another firm} before. {What made you move|How was the move}?'
   ),
   sample(
      'message',
      'since',
      'Since we connected',
      "{Hi|Hello} {first_name:there}, {we connected on|we've been connected since} {connected_date:a while ago}. {How have you been|Hope you're well}?"
   ),
   sample(
      'message',
      'call',
      'Ask for a call',
      '{Hi|Hello} {first_name:there}, {would you be open to|are you up for} a {quick|short} call {this week|next week}?'
   ),
   sample(
      'message',
      'follow-up',
      'Follow up',
      '{Hi|Hello} {first_name:there}, {just following up|circling back} on my {last|previous} message. {No rush|No pressure}.'
   ),
   sample(
      'message',
      'value',
      'Offer help',
      '{Hi|Hello} {first_name:there}, {I help|we help} teams like {company:yours} {save time|work faster}. {Worth a chat|Open to a quick chat}?'
   ),
   sample(
      'reply',
      'thanks',
      'Thanks for writing',
      '{Hi|Hello} {first_name:there}, {thanks for your message|thank you for writing|thanks for getting back to me}.'
   ),
   sample(
      'reply',
      'sure',
      'Happy to talk',
      '{Hi|Hello} {first_name:there}, {sure|happy to}! {Does|Would} {tomorrow|this week|next week} work for a {quick|short} call?'
   ),
   sample(
      'reply',
      'more',
      'Offer more details',
      '{Thanks|Thank you}, {first_name:there}! {Happy to share more|I can send more details}. {What would be most useful|Which part interests you most}?'
   ),
   sample(
      'reply',
      'later',
      'Will come back',
      "{Hi|Hello} {first_name:there}, {thanks for the reply|appreciate it}. {I'll get back to you|Let me check and come back to you} {shortly|soon}."
   ),
   sample(
      'reply',
      'not-now',
      'Understood, not now',
      '{Hi|Hello} {first_name:there}, {understood|no problem}, {thanks for letting me know|thanks for the honest answer}. {Wishing you well|All the best}.'
   ),
   sample(
      'reply',
      'question',
      'Ask for details',
      '{Thanks|Thank you}, {first_name:there}. {Could you tell me|Can you share} a bit more about {what you need|your goals}?'
   ),
   sample('reply', 'welcome', 'You are welcome', "{You're welcome|My pleasure|Glad to help}, {first_name:there}!"),
   sample(
      'reply',
      'intro',
      'Thanks for reaching out',
      '{Hi|Hello} {first_name:there}, {thanks for reaching out|thanks for the note}. {Happy to chat|Glad to talk} about {what you do at|work at} {company:your company}.'
   ),
   sample(
      'reply',
      'noted',
      'Noted',
      "{Got it|Noted|Thanks}, {first_name:there}. {I'll follow up|Will follow up} {soon|shortly}."
   ),
   sample(
      'reply',
      'time',
      'Suggest a time',
      "{Hi|Hello} {first_name:there}, {let's find a time|shall we set a time}? {Mornings|Afternoons} {work best|suit me} {this week|next week}."
   ),
]
