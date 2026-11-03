import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { toJSONSchema } from 'zod'

import { type TaskDefinition } from '../tasks/defineTask'
import { coerceAnswer, describeFields, normaliseSlug, presetInput } from './inputPrompt'

const fieldsOf = (schema: z.ZodType) => describeFields(toJSONSchema(schema) as Record<string, unknown>)

describe('describeFields', () => {
   it('should read the type, required and default of each property', () => {
      const fields = fieldsOf(
         z.strictObject({
            url: z.string(),
            pages: z.number().int().default(3),
            deep: z.boolean().optional(),
         })
      )

      expect(fields).toEqual([
         {
            name: 'url',
            type: 'string',
            required: true,
         },
         {
            name: 'pages',
            type: 'integer',
            required: false,
            default: 3,
         },
         {
            name: 'deep',
            type: 'boolean',
            required: false,
         },
      ])
   })

   it('should read the allowed values of an enum', () => {
      const [field] = fieldsOf(z.strictObject({ mode: z.enum(['fast', 'slow']) }))

      expect(field).toMatchObject({
         name: 'mode',
         options: ['fast', 'slow'],
      })
   })

   it('should ask nested values as JSON', () => {
      const [field] = fieldsOf(z.strictObject({ tags: z.array(z.string()) }))

      expect(field.type).toBe('json')
   })

   it('should have no fields for a task without input', () => {
      expect(fieldsOf(z.strictObject({}))).toEqual([])
   })
})

describe('coerceAnswer', () => {
   const field = (partial: Partial<Parameters<typeof coerceAnswer>[0]>) =>
      ({
         name: 'x',
         type: 'string',
         required: true,
         ...partial,
      }) as Parameters<typeof coerceAnswer>[0]

   it('should leave an empty optional answer out so the default applies', () => {
      expect(coerceAnswer(field({ required: false }), '')).toEqual({ skip: true })
   })

   it('should refuse an empty required answer', () => {
      expect(coerceAnswer(field({}), '')).toEqual({ error: 'This one is required.' })
   })

   it('should read yes and no as booleans', () => {
      expect(coerceAnswer(field({ type: 'boolean' }), 'yes')).toEqual({ value: true })
      expect(coerceAnswer(field({ type: 'boolean' }), 'No')).toEqual({ value: false })
      expect(coerceAnswer(field({ type: 'boolean' }), 'maybe')).toHaveProperty('error')
   })

   it('should read numbers and refuse a fraction for an integer', () => {
      expect(coerceAnswer(field({ type: 'number' }), '2.5')).toEqual({ value: 2.5 })
      expect(coerceAnswer(field({ type: 'integer' }), '4')).toEqual({ value: 4 })
      expect(coerceAnswer(field({ type: 'integer' }), '4.5')).toHaveProperty('error')
      expect(coerceAnswer(field({ type: 'number' }), 'abc')).toHaveProperty('error')
   })

   it('should accept only an allowed value for an enum', () => {
      const mode = field({ options: ['fast', 'slow'] })

      expect(coerceAnswer(mode, 'fast')).toEqual({ value: 'fast' })
      expect(coerceAnswer(mode, 'other')).toHaveProperty('error')
   })

   it('should parse JSON for a nested value and refuse invalid JSON', () => {
      expect(coerceAnswer(field({ type: 'json' }), '["a","b"]')).toEqual({ value: ['a', 'b'] })
      expect(coerceAnswer(field({ type: 'json' }), '[a')).toHaveProperty('error')
   })
})

describe('normaliseSlug', () => {
   it('should write accents the way LinkedIn does, so the contract accepts the address', () => {
      expect(normaliseSlug('sébastien-gaüzère-521240b2')).toBe('s%C3%A9bastien-ga%C3%BCz%C3%A8re-521240b2')
      expect(normaliseSlug('s%C3%A9bastien-ga%C3%BCz%C3%A8re-521240b2')).toBe(
         's%C3%A9bastien-ga%C3%BCz%C3%A8re-521240b2'
      )
   })

   it('should take the address out of a link, and leave a plain one as it is', () => {
      expect(normaliseSlug('https://www.linkedin.com/in/ada-l/?trk=x')).toBe('ada-l')
      expect(normaliseSlug('  ada-l/ ')).toBe('ada-l')
      expect(normaliseSlug('%E0%A4%A')).toBe('%25E0%25A4%25A')
   })

   it('should be used for a field called slug only', () => {
      const field = (name: string) =>
         ({
            name,
            type: 'string',
            required: true,
         }) as Parameters<typeof coerceAnswer>[0]

      expect(coerceAnswer(field('slug'), 'sébastien')).toEqual({ value: 's%C3%A9bastien' })
      expect(coerceAnswer(field('text'), 'sébastien')).toEqual({ value: 'sébastien' })
   })
})

describe('presetInput', () => {
   const task = {
      input: z.strictObject({
         slug: z.string().regex(/^[A-Za-z0-9_%-]{1,200}$/),
         text: z.string().default(''),
         pages: z.number().int().default(1),
         files: z.array(z.string()).default([]),
      }),
   } as unknown as TaskDefinition

   it('should read key=value pairs by the type of each field, splitting at the first =', () => {
      expect(presetInput(task, { fields: ['slug=sébastien', 'text=a = b', 'pages=3', 'files=["x"]'] })).toEqual({
         slug: 's%C3%A9bastien',
         text: 'a = b',
         pages: 3,
         files: ['x'],
      })
   })

   it('should take the whole input as JSON, and let a pair win over it', () => {
      expect(
         presetInput(task, {
            fields: ['text=pair'],
            json: '{"slug":"ada-l","text":"json"}',
         })
      ).toEqual({
         slug: 'ada-l',
         text: 'pair',
      })
   })

   it('should end with a message that names the problem, never asking again', () => {
      expect(() => presetInput(task, { fields: ['nope=1'] })).toThrow(/no input called nope.*slug, text, pages, files/)
      expect(() => presetInput(task, { fields: ['slug=ada-l', 'pages=1.5'] })).toThrow(/pages: Enter a whole number/)
      expect(() => presetInput(task, { fields: ['text=x'] })).toThrow(/slug/)
      expect(() => presetInput(task, { fields: ['slug='] })).toThrow(/slug: This one is required/)
   })
})
