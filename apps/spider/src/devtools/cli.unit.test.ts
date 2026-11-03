import { describe, expect, it } from 'vitest'

import { parseCommandLine } from './cli'

describe('parseCommandLine', () => {
   it('should open the menu, keeping pulled files, when nothing is typed', () => {
      expect(parseCommandLine([])).toEqual({
         kind: 'menu',
         name: '',
         keep: true,
      })
   })

   it('should take a recording name and --clean as before', () => {
      expect(parseCommandLine(['my-session', '--clean'])).toEqual({
         kind: 'menu',
         name: 'my-session',
         keep: false,
      })
   })

   it('should read a task, its input as key=value arguments, and every option', () => {
      const plan = parseCommandLine([
         'run',
         'linkedin-inmail',
         'slug=ada-l',
         'text=Hi there = hello',
         '--env',
         'staging',
         '--proxy',
         'me@example.com',
         '--account',
         'you@example.com',
         '--runs',
         '2',
         '--yes',
         '--clean',
         '--input',
         '{"subject":"Hello"}',
      ])

      expect(plan).toEqual({
         kind: 'run',
         task: 'linkedin-inmail',
         fields: ['slug=ada-l', 'text=Hi there = hello'],
         input: '{"subject":"Hello"}',
         env: 'staging',
         proxy: 'me@example.com',
         account: 'you@example.com',
         runs: 2,
         yes: true,
         keep: false,
      })
   })

   it('should take --clean before or after the command', () => {
      const keep = (argv: string[]) => {
         const plan = parseCommandLine(argv)

         return plan.kind === 'run' ? plan.keep : undefined
      }

      expect(keep(['--clean', 'run', 'x'])).toBe(false)
      expect(keep(['run', 'x', '--clean'])).toBe(false)
      expect(keep(['run', 'x'])).toBe(true)
   })

   it('should leave out what was not given, and run on this computer', () => {
      expect(parseCommandLine(['run', 'linkedin-browse'])).toEqual({
         kind: 'run',
         task: 'linkedin-browse',
         fields: [],
         env: 'local',
         yes: false,
         keep: true,
      })
   })

   it('should refuse what cannot be run, with a message that names it', () => {
      expect(() => parseCommandLine(['run'])).toThrow(/task/)
      expect(() => parseCommandLine(['run', 'linkedin-inmail', 'slug'])).toThrow(/key=value/)
      expect(() => parseCommandLine(['run', 'linkedin-inmail', '=x'])).toThrow(/key=value/)
      expect(() => parseCommandLine(['run', 'x', '--env', 'prod'])).toThrow(/env/)
      expect(() => parseCommandLine(['run', 'x', '--runs', 'many'])).toThrow(/runs/)
      expect(() => parseCommandLine(['run', 'x', '--runs', '11'])).toThrow(/runs/)
      expect(() => parseCommandLine(['run', 'x', '--input', 'not json'])).toThrow(/input/)
      expect(() => parseCommandLine(['run', 'x', '--input', '[1]'])).toThrow(/input/)
   })

   it('should hand back the help instead of running anything', () => {
      const plan = parseCommandLine(['--help'])

      expect(plan.kind).toBe('help')
      expect(plan.kind === 'help' && plan.text).toContain('run')
   })
})
