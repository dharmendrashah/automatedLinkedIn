import { type Page } from 'playwright-core'

import { type StepCall, type StepEntry } from '../recording/recorder'
import { type ElementInfo, buildSelector } from './selector'

// What devtools/recordSession.ts writes to steps.json: the same StepEntry the production recorder writes, plus the
// typed value itself (never for a password field, see R6 in .plan/spider-devtools-recorder.md) so the output is
// directly reusable when writing a new task by hand.
export type DevStepEntry = StepEntry & { value?: string; snapshot?: string }

type RawEvent =
   | { call: 'click'; element: ElementInfo; urlBefore: string }
   | { call: 'fill'; element: ElementInfo; value: string; isPassword: boolean }

// How long after a click or a form submit a navigation still counts as caused by it, rather than a fresh address
// typed by hand (which becomes its own `goto` step).
const NAVIGATION_GRACE_MS = 1000

declare global {
   interface Window {
      __devtoolsRecordEvent: (event: RawEvent) => void
   }
}

// Installed on every document (addInitScript survives navigations) in plain JS: it only has to describe the element,
// the selector preference order itself lives in selector.ts and runs in Node.
const initScript = () => {
   const describe = (element: Element): ElementInfo => {
      const path: string[] = []
      let node: Element | null = element

      while (node && node.parentElement) {
         const siblings = Array.from(node.parentElement.children).filter(child => child.tagName === node?.tagName)
         const index = siblings.indexOf(node) + 1

         path.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${index})`)
         node = node.parentElement
      }

      const text = (element.textContent ?? '').trim().slice(0, 60)

      return {
         tag: element.tagName.toLowerCase(),
         id: element.id || undefined,
         testId: element.getAttribute('data-testid') || undefined,
         ariaLabel: element.getAttribute('aria-label') || undefined,
         role: element.getAttribute('role') || undefined,
         text: text || undefined,
         path: path.join(' > '),
      }
   }

   document.addEventListener(
      'click',
      event => {
         const target = event.target as Element | null

         if (!target) {
            return
         }

         window.__devtoolsRecordEvent({
            call: 'click',
            element: describe(target),
            urlBefore: window.location.href,
         })
      },
      true
   )

   document.addEventListener(
      'change',
      event => {
         const target = event.target as HTMLInputElement | HTMLTextAreaElement | null

         if (!target || (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA')) {
            return
         }

         const isPassword = target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'password'

         window.__devtoolsRecordEvent({
            call: 'fill',
            element: describe(target),
            value: isPassword ? '' : target.value,
            isPassword,
         })
      },
      true
   )
}

// Attaches the recorder to every page of the context (addInitScript applies to pages opened after this call too).
// onStep is called once per step, in order; navigation that follows a click or a fill closely patches that same
// step's urlAfter instead of becoming its own `goto` step.
export const attachPageRecorder = async (page: Page, onStep: (step: DevStepEntry) => void) => {
   const startedAt = Date.now()
   let n = 0
   let lastInteraction: { step: DevStepEntry; at: number } | undefined

   const emit = (call: StepCall, rest: Partial<DevStepEntry>): DevStepEntry => {
      n += 1

      const step: DevStepEntry = {
         n,
         t: Date.now() - startedAt,
         call,
         durationMs: 0,
         ok: true,
         ...rest,
      }

      onStep(step)

      return step
   }

   await page.exposeFunction('__devtoolsRecordEvent', (raw: RawEvent) => {
      const selector = buildSelector(raw.element)

      if (raw.call === 'click') {
         const step = emit('click', {
            selector,
            urlBefore: raw.urlBefore,
            urlAfter: raw.urlBefore,
         })

         lastInteraction = {
            step,
            at: Date.now(),
         }

         return
      }

      const step = emit('fill', {
         selector,
         length: raw.value.length,
         ...(raw.isPassword ? {} : { value: raw.value }),
      })

      lastInteraction = {
         step,
         at: Date.now(),
      }
   })

   await page.addInitScript(initScript)

   page.on('framenavigated', frame => {
      if (frame !== page.mainFrame()) {
         return
      }

      const url = frame.url()

      if (lastInteraction && Date.now() - lastInteraction.at <= NAVIGATION_GRACE_MS) {
         lastInteraction.step.urlAfter = url
         lastInteraction = undefined

         return
      }

      emit('goto', { target: url })
   })
}
