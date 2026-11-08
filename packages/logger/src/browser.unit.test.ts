import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The body bundles the browser entry, so it must not reach for Node built-ins or the contracts package.
const IMPORT = /from '([^']+)'/g

const importsOf = (file: string) => {
   const source = readFileSync(join(process.cwd(), 'src', file), 'utf8')

   return [...source.matchAll(IMPORT)].map(([, specifier]) => specifier)
}

const importGraph = (file: string, seen = new Set<string>()): string[] => {
   if (seen.has(file)) {
      return []
   }

   seen.add(file)

   const specifiers = importsOf(file)
   const local = specifiers.filter(specifier => specifier.startsWith('./')).map(specifier => `${specifier.slice(2)}.ts`)

   return [...specifiers, ...local.flatMap(next => importGraph(next, seen))]
}

describe('browser entry', () => {
   it('should import no Node built-in and not the contracts package, through any file it imports', () => {
      const specifiers = importGraph('browser.ts')

      expect(specifiers.filter(specifier => specifier.startsWith('node:'))).toEqual([])
      expect(specifiers).not.toContain('@automatedLinkedIn/contracts')
   })
})
