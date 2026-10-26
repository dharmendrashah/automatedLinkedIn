export type Emoji = {
   emoji: string
   // Lower case, no spaces: what is typed after the colon.
   name: string
   keywords: string[]
}

const e = (emoji: string, name: string, ...keywords: string[]): Emoji => ({
   emoji,
   name,
   keywords,
})

// The emoji the picker and the `:` list offer: the ones people use most in business posts. Not the whole set: a person who wants
// another one uses the keyboard's own emoji panel, which types into the same box.
export const EMOJI_GROUPS: { name: string; items: Emoji[] }[] = [
   {
      name: 'Faces',
      items: [
         e('😀', 'grinning', 'happy', 'smile'),
         e('😄', 'smile', 'happy', 'joy'),
         e('😁', 'grin', 'happy'),
         e('😊', 'blush', 'happy', 'warm'),
         e('🙂', 'slight_smile', 'smile', 'calm'),
         e('🙃', 'upside_down', 'silly'),
         e('😉', 'wink', 'flirt'),
         e('😍', 'heart_eyes', 'love', 'like'),
         e('🤩', 'star_struck', 'wow', 'amazing'),
         e('😎', 'sunglasses', 'cool'),
         e('🤓', 'nerd', 'smart', 'geek'),
         e('🤔', 'thinking', 'hmm', 'question'),
         e('😅', 'sweat_smile', 'relief', 'nervous'),
         e('😂', 'joy', 'laugh', 'lol', 'funny'),
         e('🤗', 'hugging', 'hug', 'thanks'),
         e('😇', 'angel', 'innocent'),
         e('😬', 'grimace', 'awkward'),
         e('😴', 'sleeping', 'tired', 'zzz'),
         e('🤯', 'mind_blown', 'shocked', 'wow'),
         e('😢', 'cry', 'sad', 'tear'),
         e('😭', 'sob', 'sad', 'crying'),
         e('😮', 'open_mouth', 'surprised', 'wow'),
         e('😡', 'angry', 'mad'),
         e('🥳', 'partying', 'party', 'celebrate', 'birthday'),
      ],
   },
   {
      name: 'Hands',
      items: [
         e('👍', 'thumbs_up', 'like', 'yes', 'good', 'approve'),
         e('👎', 'thumbs_down', 'dislike', 'no', 'bad'),
         e('👏', 'clap', 'applause', 'bravo', 'congrats'),
         e('🙌', 'raised_hands', 'celebrate', 'hooray', 'praise'),
         e('🙏', 'pray', 'thanks', 'please', 'thank_you'),
         e('🤝', 'handshake', 'deal', 'agree', 'partnership'),
         e('💪', 'muscle', 'strong', 'power', 'flex'),
         e('👋', 'wave', 'hello', 'hi', 'bye'),
         e('🤞', 'crossed_fingers', 'luck', 'hope'),
         e('✌️', 'victory', 'peace', 'two'),
         e('👌', 'ok_hand', 'ok', 'perfect'),
         e('👇', 'point_down', 'below', 'down'),
         e('👉', 'point_right', 'next', 'right'),
         e('👀', 'eyes', 'look', 'see', 'watch'),
         e('🫶', 'heart_hands', 'love', 'care'),
         e('✍️', 'writing', 'write', 'author'),
      ],
   },
   {
      name: 'Work',
      items: [
         e('💼', 'briefcase', 'work', 'business', 'job'),
         e('📈', 'chart_up', 'growth', 'increase', 'trend'),
         e('📊', 'bar_chart', 'data', 'stats', 'report'),
         e('🚀', 'rocket', 'launch', 'startup', 'fast'),
         e('🎯', 'target', 'goal', 'focus', 'bullseye'),
         e('💡', 'bulb', 'idea', 'tip', 'light'),
         e('📣', 'megaphone', 'announce', 'news'),
         e('📅', 'calendar', 'date', 'schedule', 'event'),
         e('✅', 'check', 'done', 'yes', 'complete'),
         e('🔑', 'key', 'access', 'secret'),
         e('🏆', 'trophy', 'win', 'award', 'champion'),
         e('📌', 'pin', 'pinned', 'note'),
         e('🧠', 'brain', 'smart', 'think', 'mind'),
         e('🛠️', 'tools', 'build', 'fix', 'work'),
         e('📚', 'books', 'read', 'learn', 'study'),
         e('🎓', 'graduation', 'learn', 'school', 'degree'),
         e('💻', 'laptop', 'computer', 'code', 'work'),
         e('📧', 'email', 'mail', 'message'),
         e('📞', 'phone', 'call', 'contact'),
         e('💰', 'money', 'cash', 'revenue', 'sales'),
         e('🤖', 'robot', 'ai', 'automation', 'bot'),
         e('🔍', 'search', 'find', 'magnifier'),
      ],
   },
   {
      name: 'Symbols',
      items: [
         e('🔥', 'fire', 'hot', 'lit', 'trending'),
         e('⭐', 'star', 'favorite', 'rating'),
         e('✨', 'sparkles', 'new', 'magic', 'shine'),
         e('🌟', 'glowing_star', 'shine', 'star'),
         e('❤️', 'heart', 'love', 'like'),
         e('💙', 'blue_heart', 'love', 'trust'),
         e('⚡', 'zap', 'lightning', 'fast', 'energy'),
         e('🎉', 'tada', 'party', 'celebrate', 'congrats'),
         e('➡️', 'arrow_right', 'next', 'right'),
         e('⬇️', 'arrow_down', 'below', 'down'),
         e('❗', 'exclamation', 'important', 'alert'),
         e('❓', 'question', 'ask', 'help'),
         e('💯', 'hundred', '100', 'perfect', 'score'),
         e('🔔', 'bell', 'notify', 'reminder'),
         e('📍', 'round_pushpin', 'location', 'place'),
         e('☑️', 'check_box', 'done', 'task'),
         e('⚠️', 'warning', 'careful', 'caution'),
         e('🆕', 'new', 'fresh', 'announcement'),
         e('🔗', 'link', 'url', 'chain'),
      ],
   },
   {
      name: 'Nature and food',
      items: [
         e('🌱', 'seedling', 'grow', 'start', 'plant'),
         e('🌍', 'earth', 'world', 'global', 'planet'),
         e('☀️', 'sun', 'sunny', 'day'),
         e('🌈', 'rainbow', 'colour', 'hope'),
         e('🌊', 'wave_ocean', 'sea', 'water'),
         e('🌳', 'tree', 'nature', 'green'),
         e('☕', 'coffee', 'tea', 'morning', 'break'),
         e('🍀', 'clover', 'luck', 'lucky'),
         e('🍎', 'apple', 'fruit', 'healthy'),
         e('🍕', 'pizza', 'food', 'lunch'),
         e('🎂', 'birthday', 'cake', 'party'),
         e('🥂', 'cheers', 'champagne', 'toast', 'celebrate'),
      ],
   },
]

const ALL = EMOJI_GROUPS.flatMap(({ items }) => items)

const MOST = 8

// How well a name or keyword matches what was typed; lower is better, undefined is no match.
const rank = ({ name, keywords }: Emoji, query: string) => {
   if (name.startsWith(query)) {
      return 0
   }

   if (name.split('_').some(word => word.startsWith(query))) {
      return 1
   }

   if (keywords.some(keyword => keyword.startsWith(query))) {
      return 2
   }

   if (name.includes(query)) {
      return 3
   }

   return keywords.some(keyword => keyword.includes(query)) ? 4 : undefined
}

// The emoji to offer for what is typed after a colon: best matches first, at most eight, in the order of the list among equals.
export const findEmoji = (query: string) => {
   const wanted = query.trim().toLowerCase()

   if (wanted === '') {
      return []
   }

   return ALL.flatMap((item, index) => {
      const score = rank(item, wanted)

      return score === undefined ? [] : [{ item, score, index }]
   })
      .sort((a, b) => a.score - b.score || a.index - b.index)
      .slice(0, MOST)
      .map(({ item }) => item)
}

// The text with the emoji put where the selection is (replacing it) and where the caret goes after. With no selection (null) it is
// added at the end.
export const insertAt = (value: string, start: number | null, end: number | null, emoji: string) => {
   const from = start ?? value.length
   const to = end ?? from
   const next = `${value.slice(0, from)}${emoji}${value.slice(to)}`

   return {
      value: next,
      caret: from + emoji.length,
   }
}
