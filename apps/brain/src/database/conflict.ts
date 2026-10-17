// A write the owner can fix: a taken name, a person already seen. The message is shown to the user as it is.
export class ConflictError extends Error {}

export const isUniqueViolation = (error: unknown) => (error as { code?: string } | null)?.code === 'P2002'

// Turns a unique-index clash into a ConflictError with the given message.
export const uniqueOr = async <T>(write: Promise<T>, message: string) => {
   try {
      return await write
   } catch (error) {
      if (isUniqueViolation(error)) {
         throw new ConflictError(message)
      }

      throw error
   }
}
