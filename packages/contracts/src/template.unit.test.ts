import { describe, expect, it } from 'vitest'

import {
   MESSAGE_SAMPLES,
   TEMPLATE_EXAMPLE_VALUES,
   TEMPLATE_VARIABLES,
   countVariants,
   humanAgo,
   humanDate,
   missingSentence,
   renderAll,
   renderTemplate,
   templateProblems,
   usedVariables,
} from './template'

const first = () => 0
const last = () => 0.999

describe('renderTemplate', () => {
   it('should fill variables, use a fallback when a value is missing, and leave a missing one without a fallback empty and listed', () => {
      const rendered = renderTemplate('Hi {first_name:there}, how is {company}?', { first_name: 'Ada' })

      expect(rendered.text).toBe('Hi Ada, how is?')
      expect(rendered.missing).toEqual(['company'])
      expect(renderTemplate('Hi {first_name:there}!', {}).text).toBe('Hi there!')
      expect(renderTemplate('Hi {first_name:there}!', { first_name: '  ' }).text).toBe('Hi there!')
      expect(renderTemplate('Hi {first_name:there}!', {}).missing).toEqual([])
   })

   it('should pick one option of a spintax group, with variables and nested groups inside', () => {
      const text = '{Hi {first_name}|Hello|{Hey|Yo} there}'

      expect(renderTemplate(text, { first_name: 'Ada' }, first).text).toBe('Hi Ada')
      expect(renderTemplate(text, { first_name: 'Ada' }, last).text).toBe('Yo there')
      expect(renderTemplate('{a|b|c}', {}, () => 0.5).text).toBe('b')
   })

   it('should write a brace after a backslash as it is, and tidy the spaces and the space before punctuation', () => {
      expect(renderTemplate('Use \\{this\\} {first_name} , ok', { first_name: 'Ada' }).text).toBe('Use {this} Ada, ok')
      expect(renderTemplate('Hi   {first_name:}  !', {}).text).toBe('Hi!')
   })

   it('should pick every option now and then when the choice is random', () => {
      const seen = new Set(Array.from({ length: 200 }, () => renderTemplate('{a|b|c}', {}).text))

      expect([...seen].sort()).toEqual(['a', 'b', 'c'])
   })
})

describe('renderAll and countVariants', () => {
   it('should list every variant once, with the values filled in, and count the ways', () => {
      const text = '{Hi|Hello} {first_name:there}, {thanks|{good|great} to connect}'

      expect(countVariants(text)).toBe(6)
      expect(renderAll(text, { first_name: 'Ada' })).toEqual([
         'Hi Ada, thanks',
         'Hi Ada, good to connect',
         'Hi Ada, great to connect',
         'Hello Ada, thanks',
         'Hello Ada, good to connect',
         'Hello Ada, great to connect',
      ])
   })

   it('should stop at the limit and not overflow on a very large number of variants', () => {
      const text = Array.from({ length: 30 }, () => '{a|b|c|d}').join(' ')

      expect(renderAll(text, {}, 10)).toHaveLength(10)
      expect(countVariants(text)).toBe(1_000_000)
      expect(countVariants('no choices')).toBe(1)
   })
})

describe('templateProblems', () => {
   it('should accept the variables and groups the editor offers', () => {
      expect(templateProblems('{Hi|Hello} {first_name:there}, {company}')).toEqual([])
      expect(templateProblems('')).toEqual([])
   })

   it('should say what is wrong in plain words', () => {
      expect(templateProblems('Hi {first_name')).toEqual(['A { is not closed.'])
      expect(templateProblems('Hi first_name}')).toEqual(['A } has no { before it.'])
      expect(templateProblems('Hi {nickname}')).toEqual(['{nickname} is not a variable. Pick one from the list.'])
      expect(templateProblems('Hi {}')).toEqual([
         'Write a variable name like {first_name}, or options like {Hi|Hello}.',
      ])
      expect(templateProblems('Hi {Hello there}')).toEqual([
         'Write a variable name like {first_name}, or options like {Hi|Hello}.',
      ])
   })

   it('should check the longest variant against the limit, with example values', () => {
      expect(templateProblems('{Hi|Hello there my very long friend} {full_name}', { maxChars: 20 })).toEqual([
         'The longest version is 44 characters, over the 20 allowed.',
      ])
      expect(templateProblems('Hi {first_name}', { maxChars: 20 })).toEqual([])
   })

   it('should list the variables a text uses, once each, in order', () => {
      expect(usedVariables('{first_name} {Hi|{company}} {first_name:x} {nope}')).toEqual([
         'first_name',
         'company',
         'nope',
      ])
   })
})

describe('missingSentence', () => {
   it('should name the variables in words', () => {
      expect(missingSentence(['first_name'])).toBe('No value for first name, so it was skipped.')
      expect(missingSentence(['company', 'previous_company'])).toBe(
         'No value for current company and previous company, so it was skipped.'
      )
   })
})

describe('human times', () => {
   const now = new Date('2026-11-03T12:00:00Z')

   it('should say how long ago in the unit a person would use', () => {
      const ago = (iso: string) => humanAgo(iso, now)

      expect(ago('2026-11-03T11:59:40Z')).toBe('just now')
      expect(ago('2026-11-03T11:55:00Z')).toBe('5 minutes ago')
      expect(ago('2026-11-03T11:00:00Z')).toBe('1 hour ago')
      expect(ago('2026-11-02T06:00:00Z')).toBe('yesterday')
      expect(ago('2026-10-30T12:00:00Z')).toBe('4 days ago')
      expect(ago('2026-10-13T12:00:00Z')).toBe('3 weeks ago')
      expect(ago('2026-06-03T12:00:00Z')).toBe('5 months ago')
      expect(ago('2024-11-03T12:00:00Z')).toBe('2 years ago')
      expect(ago('not a date')).toBeNull()
   })

   it('should write a date as day, month and year', () => {
      expect(humanDate('2026-10-12T23:30:00Z')).toBe('12 Oct 2026')
      expect(humanDate('nope')).toBeNull()
   })
})

describe('samples', () => {
   it('should offer many short samples for each of the three uses, with no problems in any of them', () => {
      for (const use of ['invite', 'message', 'reply'] as const) {
         expect(MESSAGE_SAMPLES.filter(sample => sample.use === use).length).toBeGreaterThanOrEqual(10)
      }

      for (const sample of MESSAGE_SAMPLES) {
         expect(templateProblems(sample.text), sample.id).toEqual([])
         expect(sample.text.length, sample.id).toBeLessThanOrEqual(220)
      }

      expect(new Set(MESSAGE_SAMPLES.map(({ id }) => id)).size).toBe(MESSAGE_SAMPLES.length)
   })

   it('should keep every invite sample inside the 200 characters of a note, in its longest version', () => {
      for (const sample of MESSAGE_SAMPLES.filter(({ use }) => use === 'invite')) {
         expect(templateProblems(sample.text, { maxChars: 200 }), sample.id).toEqual([])
      }
   })

   it('should describe every variable it knows, each with an example', () => {
      for (const variable of TEMPLATE_VARIABLES) {
         expect(TEMPLATE_EXAMPLE_VALUES[variable.key], variable.key).toBeTruthy()
      }
   })
})
