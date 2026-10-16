const NAME_PATTERN = /^[a-z][a-z0-9-]{0,49}$/

// Fails at boot, not at the first message: a name is how logs, health and the replay command refer to a definition.
export const unique = <T extends { name: string }>(kind: string, items: T[]) => {
   const seen = new Set<string>()

   for (const { name } of items) {
      if (!NAME_PATTERN.test(name)) {
         throw new Error(`The ${kind} name "${name}" is not valid`)
      }

      if (seen.has(name)) {
         throw new Error(`The ${kind} "${name}" is registered twice`)
      }

      seen.add(name)
   }

   return items
}
