import { type DevStepEntry } from './pageRecorder'

const quote = (value: string) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

// One recorded step as a line of code against TaskContext (apps/spider/src/tasks/defineTask.ts), so it can be
// pasted straight into a new task's run().
const lineFor = (step: DevStepEntry): string => {
   if (step.call === 'goto' && step.target) {
      return `await context.visit(${quote(step.target)})`
   }

   if (step.call === 'click' && step.selector) {
      return `await context.browser.click(${quote(step.selector)})`
   }

   if (step.call === 'fill' && step.selector) {
      const value = step.value === undefined ? '/* not recorded: a password field */' : quote(step.value)

      return `await context.browser.fill(${quote(step.selector)}, ${value})`
   }

   return `// step ${step.n}: ${step.call} (nothing to render)`
}

// A skeleton.md next to steps.json: a readable list of what happened, and a code block ready to paste into a new
// defineTask's run().
export const renderSkeleton = (steps: DevStepEntry[]): string => {
   const code = steps.map(lineFor).join('\n')

   const list = steps
      .map(step => {
         const detail = step.selector ?? step.target ?? ''

         return `- step ${step.n}: ${step.call}${detail ? ` \u2014 ${detail}` : ''}`
      })
      .join('\n')

   return `# Recorded steps\n\n${list}\n\n## As TaskContext calls\n\n\`\`\`ts\n${code}\n\`\`\`\n`
}
