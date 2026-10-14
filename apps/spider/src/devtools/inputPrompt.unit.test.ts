import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { toJSONSchema } from 'zod'

import { coerceAnswer, describeFields } from './inputPrompt'

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
