import { describe, expect, it } from 'vitest'

import { type NodeConfig, apiBodySchema, apiFields, applyApiInput, blockOf, catalog } from './workflow'

// The blocks a call can feed are described on the blocks themselves (.plan/api-fed-blocks-and-samples.md): these tests
// hold for any block added later, so a new description needs no new test.

const described = catalog().filter(({ api }) => api.length > 0)

const valueOf = ({ shape, example }: { shape: 'list' | 'text'; example: string[] }) =>
   shape === 'text' ? example[0] : example

describe('descriptions of what a call may feed', () => {
   it('should describe the input blocks and the collect blocks that start a chain on their own', () => {
      expect(described.map(({ type }) => type).sort()).toEqual(
         [
            'collect.domainLookup',
            'collect.findPosts',
            'collect.searchPeople',
            'input.companies',
            'input.posts',
            'input.profiles',
         ].sort()
      )
   })

   it('should only describe a block that takes nothing from before, and say so in the catalog the page reads', () => {
      for (const block of described) {
         expect(block.input).toBe('start')
      }
   })

   it('should give each field once, and make blocks that share a field agree on it', () => {
      const all = described.flatMap(({ api }) => api)

      for (const { field, shape, check } of all) {
         for (const other of all.filter(each => each.field === field)) {
            expect([other.shape, other.check]).toEqual([shape, check])
         }
      }

      expect(apiFields().map(({ field }) => field)).toEqual([...new Set(all.map(({ field }) => field))])
   })

   it('should replace only a setting the block really has', () => {
      for (const { type, fields, api } of described) {
         for (const { setting } of api) {
            expect(setting === undefined || fields.some(({ key }) => key === setting)).toBe(true)
         }

         expect(type).toBeTruthy()
      }
   })

   it('should make every example a body the check accepts, and a setting the block accepts', () => {
      for (const { type, api, defaults } of described) {
         const body = Object.fromEntries(api.map(each => [each.field, valueOf(each)]))

         expect(apiBodySchema(200).safeParse(body).success).toBe(true)
         expect(
            blockOf(type).config.safeParse(applyApiInput(type, defaults, body)).success ||
               // A block with a required setting has no default; the call supplies it.
               blockOf(type).config.safeParse(applyApiInput(type, {}, body)).success
         ).toBe(true)
      }
   })

   it('should accept the most values a field allows, as a setting', () => {
      for (const { type, api } of described) {
         for (const { field, shape, max, setting } of api.filter(each => each.shape === 'list' && each.setting)) {
            const body = { [field]: Array.from({ length: max ?? 1 }, (_, index) => `value${index}.com`) }

            expect(shape).toBe('list')
            expect(apiBodySchema(200).safeParse(body).success).toBe(true)
            expect(blockOf(type).config.safeParse(applyApiInput(type, {}, body)).success, `${type} ${setting}`).toBe(
               true
            )
         }
      }
   })
})

describe('apiBodySchema', () => {
   it('should accept an empty call and every described field', () => {
      expect(apiBodySchema(200).safeParse({}).success).toBe(true)
      expect(
         apiBodySchema(200).safeParse({
            profiles: ['https://www.linkedin.com/in/ada'],
            keywords: 'outbound',
            domains: ['stripe.com'],
         }).success
      ).toBe(true)
   })

   it('should refuse a field nothing describes, an empty value, and a list above its limit', () => {
      const schema = apiBodySchema(200)

      expect(schema.safeParse({ nope: ['x'] }).success).toBe(false)
      expect(schema.safeParse({ keywords: '   ' }).success).toBe(false)
      expect(schema.safeParse({ domains: [' '] }).success).toBe(false)
      expect(schema.safeParse({ domains: Array.from({ length: 101 }, () => 'a.com') }).success).toBe(false)
   })

   it('should count every value of every field against the total', () => {
      const schema = apiBodySchema(3)

      expect(
         schema.safeParse({
            profiles: ['a', 'b'],
            keywords: 'x',
         }).success
      ).toBe(true)
      expect(
         schema.safeParse({
            profiles: ['a', 'b'],
            keywords: 'x',
            titles: ['y'],
         }).success
      ).toBe(false)
   })

   it('should only check the length of a link, and leave reading it to the block', () => {
      expect(apiBodySchema(200).safeParse({ posts: ['not a link at all'] }).success).toBe(true)
      expect(apiBodySchema(200).safeParse({ posts: ['x'.repeat(501)] }).success).toBe(false)
   })
})

describe('applyApiInput', () => {
   const saved: NodeConfig = {
      keywords: 'saved words',
      howMany: 25,
   }

   it('should put what a call sent in place of the setting it replaces, for that run only', () => {
      const config = applyApiInput('collect.findPosts', saved, { keywords: 'from the call' })

      expect(config).toEqual({
         keywords: 'from the call',
         howMany: 25,
      })
      expect(saved.keywords).toBe('saved words')
   })

   it('should keep the setting when the call sent nothing for it, or an empty value', () => {
      expect(applyApiInput('collect.findPosts', saved, {})).toEqual(saved)
      expect(applyApiInput('collect.findPosts', saved, { keywords: '  ' })).toEqual(saved)
      expect(applyApiInput('collect.findPosts', saved, null)).toEqual(saved)
   })

   it('should map a field to the setting it names, which can differ from the field', () => {
      expect(
         applyApiInput(
            'collect.searchPeople',
            {},
            {
               workingAt: ['Stripe'],
               titles: ['CTO'],
            }
         )
      ).toEqual({
         companies: ['Stripe'],
         titles: ['CTO'],
      })
   })

   it('should leave a block that no call feeds, and a block that reads the call itself, as they are', () => {
      expect(applyApiInput('score.icp', saved, { keywords: 'x' })).toEqual(saved)
      expect(applyApiInput('input.posts', saved, { posts: ['https://x'] })).toEqual(saved)
   })
})
