import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The product never shows who supplies the data (.plan/gtm-workflows.md). The browser code and this package, which
// the browser's catalog comes from, must not name the supplier. Test files are left out: they hold the pattern.

const SUPPLIER = new RegExp(['mind', 'case|api', 'fy'].join(''), 'i')

const filesIn = (dir: string): string[] =>
   readdirSync(dir).flatMap(entry => {
      const path = join(dir, entry)

      if (statSync(path).isDirectory()) {
         return filesIn(path)
      }

      return /\.(ts|tsx|css|html|json)$/.test(entry) && !/\.test\.ts$/.test(entry) ? [path] : []
   })

describe('supplier name guard', () => {
   it.each([join(__dirname), join(__dirname, '../../../apps/body/src')])('should find no supplier name in %s', dir => {
      const leaks = filesIn(dir).filter(file => SUPPLIER.test(readFileSync(file, 'utf8')))

      expect(leaks).toEqual([])
   })
})
