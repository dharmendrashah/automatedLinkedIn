import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

// Reads the leading comment an engineer already wrote above each tRPC procedure and above each resolver's own
// router, so the generated OpenAPI doc can reuse real, accurate documentation instead of nothing or a guess
// (.plan/api-authentication-and-openapi-docs.md). Line-based on purpose, not a full TypeScript AST parse: every
// resolver file here is Prettier-formatted the same way (one `export const X = router({ ... })` or one bare
// `export const X = someProcedure...` per block, procedures at exactly 3-space indentation), so position alone
// tells a procedure property from a zod field apart. Finds real text or finds nothing; it never attaches the
// wrong comment to the wrong procedure.

export type ResolverComments = {
   // "workflow.rotateToken" -> the comment directly above that procedure.
   operations: Record<string, string>
   // "workflow" -> the comment directly above that router (becomes its tag's description).
   modules: Record<string, string>
}

const ROUTER_EXPORT = /^export const (\w+) = (router\(\{)?/
const PROCEDURE_PROPERTY = /^ {3}(\w+):/
const TOP_LEVEL_EXPORT = /^export const /
const COMMENT_LINE = /^\s*\/\//

const stripComment = (line: string) => line.replace(/^\s*\/\/\s?/, '')

// The contiguous //-prefixed lines directly above `index`, joined into one sentence. null when there is none.
const commentAbove = (lines: string[], index: number): string | null => {
   const collected: string[] = []
   let i = index - 1

   while (i >= 0 && COMMENT_LINE.test(lines[i])) {
      collected.unshift(stripComment(lines[i]).trim())
      i -= 1
   }

   return collected.length > 0 ? collected.join(' ') : null
}

const listResolverFiles = (dir: string): string[] =>
   readdirSync(dir).flatMap(name => {
      const full = join(dir, name)

      if (statSync(full).isDirectory()) {
         return listResolverFiles(full)
      }

      return name.endsWith('.ts') && !name.includes('.test.') ? [full] : []
   })

const readFile = (file: string, result: ResolverComments) => {
   const lines = readFileSync(file, 'utf8').split('\n')
   let i = 0

   while (i < lines.length) {
      const exported = ROUTER_EXPORT.exec(lines[i])

      if (!exported) {
         i += 1
         continue
      }

      const [, name] = exported

      if (!exported[2]) {
         // A bare procedure export (e.g. `export const me = userProcedure.query(...)`).
         const comment = commentAbove(lines, i)

         if (comment) {
            result.operations[name] = comment
         }

         i += 1
         continue
      }

      // A `router({ ... })` block: everything up to the next top-level export (or the end of the file) belongs to
      // it. A page.ts-style file can hold more than one such block.
      const moduleComment = commentAbove(lines, i)

      if (moduleComment) {
         result.modules[name] = moduleComment
      }

      let j = i + 1

      while (j < lines.length && !TOP_LEVEL_EXPORT.test(lines[j])) {
         const property = PROCEDURE_PROPERTY.exec(lines[j])

         if (property) {
            const comment = commentAbove(lines, j)

            if (comment) {
               result.operations[`${name}.${property[1]}`] = comment
            }
         }

         j += 1
      }

      i = j
   }
}

// dir defaults to the real resolvers folder; a test points it at a fixture directory instead.
export const resolverComments = (dir = 'src/trpc/api/resolvers'): ResolverComments => {
   const result: ResolverComments = {
      operations: {},
      modules: {},
   }

   for (const file of listResolverFiles(dir)) {
      readFile(file, result)
   }

   return result
}
