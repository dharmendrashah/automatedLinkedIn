import { describe, expect, it } from 'vitest'

import { buildCommand } from './command'

const task = {
   name: 'browser-detection',
   version: 1,
}

describe('buildCommand', () => {
   it('should build a manual command that the contract accepts', () => {
      const command = buildCommand({
         task,
         input: {},
      })

      expect(command).toMatchObject({
         task: 'browser-detection',
         task_version: 1,
         trigger: 'manual',
         user_id: 'devtools',
         input: {},
      })
      expect(command).not.toHaveProperty('proxy')
      expect(command).not.toHaveProperty('credentials')
   })

   it('should carry the proxy and the sealed account only when they were chosen', () => {
      const command = buildCommand({
         task,
         input: {},
         proxy: { server: 'http://203.0.113.4:8080' },
         account: {
            id: '01a13bfc-9cb8-7036-a2ae-438f5599f54c',
            email: 'anna@example.com',
            secret: {
               ciphertext: 'ct',
               iv: 'iv',
               tag: 'tag',
               key_version: 1,
            },
         },
      })

      expect(command.proxy).toEqual({ server: 'http://203.0.113.4:8080' })
      expect(command).toMatchObject({
         account_id: '01a13bfc-9cb8-7036-a2ae-438f5599f54c',
         account_email: 'anna@example.com',
         credentials: {
            ciphertext: 'ct',
            key_version: 1,
         },
      })
   })

   it('should give every command its own id', () => {
      expect(
         buildCommand({
            task,
            input: {},
         }).task_id
      ).not.toBe(
         buildCommand({
            task,
            input: {},
         }).task_id
      )
   })
})
