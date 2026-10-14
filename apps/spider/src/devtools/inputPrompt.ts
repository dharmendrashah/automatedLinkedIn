import { toJSONSchema } from 'zod'

import { type TaskDefinition } from '../tasks/defineTask'
import { ask } from './prompt'

export type Field = {
   name: string
   type: 'string' | 'number' | 'integer' | 'boolean' | 'json'
   required: boolean
   options?: unknown[]
   default?: unknown
   description?: string
}

type Answer = { value: unknown } | { skip: true } | { error: string }

type JsonProperty = {
   type?: unknown
   enum?: unknown[]
   default?: unknown
   description?: string
}

const SIMPLE_TYPES = ['string', 'number', 'integer', 'boolean'] as const

// What to ask for each property of a task's input, read from the JSON Schema of its zod schema (the one the catalog uses).
export const describeFields = (schema: Record<string, unknown>): Field[] => {
   const properties = (schema.properties ?? {}) as Record<string, JsonProperty>
   const required = new Set((schema.required ?? []) as string[])

   return Object.entries(properties).map(([name, property]) => {
      const simple = SIMPLE_TYPES.find(type => type === property.type)

      return {
         name,
         type: simple ?? 'json',
         required: required.has(name) && property.default === undefined,
         ...(property.enum && { options: property.enum }),
         ...(property.default !== undefined && { default: property.default }),
         ...(property.description && { description: property.description }),
      }
   })
}

const toBoolean = (text: string) => {
   if (/^(y|yes|true)$/i.test(text)) {
      return true
   }

   return /^(n|no|false)$/i.test(text) ? false : undefined
}

// Turns what was typed into the field's value. An empty answer leaves the field out, so the task's own default applies.
export const coerceAnswer = (field: Field, text: string): Answer => {
   if (text === '') {
      return field.required ? { error: 'This one is required.' } : { skip: true }
   }

   if (field.options) {
      const match = field.options.find(option => String(option) === text)

      return match === undefined ? { error: `Use one of: ${field.options.join(', ')}` } : { value: match }
   }

   if (field.type === 'string') {
      return { value: text }
   }

   if (field.type === 'boolean') {
      const value = toBoolean(text)

      return value === undefined ? { error: 'Answer yes or no.' } : { value }
   }

   if (field.type === 'number' || field.type === 'integer') {
      const value = Number(text)

      if (!Number.isFinite(value) || (field.type === 'integer' && !Number.isInteger(value))) {
         return { error: field.type === 'integer' ? 'Enter a whole number.' : 'Enter a number.' }
      }

      return { value }
   }

   try {
      return { value: JSON.parse(text) as unknown }
   } catch {
      return { error: 'Enter valid JSON.' }
   }
}

const labelOf = (field: Field) => {
   const kind = field.options ? field.options.join(' | ') : field.type === 'json' ? 'JSON' : field.type
   const note = field.required ? 'required' : field.default === undefined ? 'optional' : `default ${field.default}`

   return `${field.name} (${kind}, ${note})${field.description ? ` \u2014 ${field.description}` : ''}`
}

// Asks every field of the task's input, then checks the whole answer with the task's own schema. A rejected answer starts
// again with the schema's messages, which name the field and never repeat the value.
export const askInput = async (task: TaskDefinition): Promise<Record<string, unknown>> => {
   const fields = describeFields(toJSONSchema(task.input) as Record<string, unknown>)

   for (;;) {
      const answers: Record<string, unknown> = {}

      for (const field of fields) {
         for (;;) {
            const answer = coerceAnswer(field, await ask(labelOf(field)))

            if ('error' in answer) {
               console.log(answer.error)

               continue
            }

            if ('value' in answer) {
               answers[field.name] = answer.value
            }

            break
         }
      }

      const checked = task.input.safeParse(answers)

      if (checked.success) {
         return answers
      }

      checked.error.issues.forEach(issue => console.log(`${issue.path.join('.') || 'input'}: ${issue.message}`))
      console.log('Let us try again.')
   }
}
