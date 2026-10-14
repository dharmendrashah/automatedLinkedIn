// What the in-page script (pageRecorder.ts) can tell Node about an element, enough to build a stable selector
// without shipping a full DOM reference across the page/Node boundary.
export type ElementInfo = {
   tag: string
   id?: string
   testId?: string
   ariaLabel?: string
   role?: string
   text?: string
   // A CSS path built in-page as the last resort (e.g. "div:nth-of-type(2) > button:nth-of-type(1)").
   path: string
}

const CSS_IDENTIFIER = /^[A-Za-z][\w-]*$/

const escapeAttr = (value: string) => value.replace(/"/g, '\\"')

// Chrome DevTools Recorder's own preference order, narrowed to plain CSS (see R7 in
// .plan/spider-devtools-recorder.md): a stable test attribute first, then id, then an accessible name, then a short
// unique bit of visible text, then a structural path as the fallback that always works.
export const buildSelector = (element: ElementInfo): string => {
   if (element.testId) {
      return `[data-testid="${escapeAttr(element.testId)}"]`
   }

   if (element.id && CSS_IDENTIFIER.test(element.id)) {
      return `#${element.id}`
   }

   if (element.ariaLabel) {
      return `${element.tag}[aria-label="${escapeAttr(element.ariaLabel)}"]`
   }

   if (element.role) {
      return `${element.tag}[role="${escapeAttr(element.role)}"]`
   }

   if (element.text && element.text.length <= 60) {
      return `${element.tag}:has-text("${escapeAttr(element.text)}")`
   }

   return element.path
}
