import { type BrowserIdentity, type DetectionSession, type ProbeReading } from '../scraping/driver'
import { RecordedSession } from './recordedSession'
import { type Recorder } from './recorder'

// A recorded session that can also scroll: each scroll is a step with a screenshot of where it ended. Reading the page and
// the full-page picture are passed through, because the browser test saves those itself.
export class RecordedDetectionSession extends RecordedSession implements DetectionSession {
   // Present only when the browser can be probed, so a task can tell.
   public readonly probe?: () => Promise<ProbeReading>
   // Likewise for the page inspection and for what a hand does on the page: the run's video shows them, and the task logs
   // what it did, so they are not steps of their own.
   public readonly inspect?: DetectionSession['inspect']
   public readonly clickLink?: DetectionSession['clickLink']
   public readonly clickInside?: DetectionSession['clickInside']
   public readonly clickSelector?: DetectionSession['clickSelector']
   public readonly clickNth?: DetectionSession['clickNth']
   public readonly scrollOver?: DetectionSession['scrollOver']
   public readonly typeKeys?: DetectionSession['typeKeys']
   public readonly attachFiles?: DetectionSession['attachFiles']
   public readonly fetchFile?: DetectionSession['fetchFile']
   public readonly watchAnswers?: DetectionSession['watchAnswers']
   public readonly back?: DetectionSession['back']
   public readonly hover?: DetectionSession['hover']
   public readonly drift?: DetectionSession['drift']

   public constructor(
      private readonly detector: DetectionSession,
      recorder: Pick<Recorder, 'addStep' | 'log' | 'addSecret' | 'saveScreenshot' | 'saveFailureHtml'>
   ) {
      super(detector, recorder)

      const {
         probe,
         inspect,
         clickLink,
         clickInside,
         clickSelector,
         clickNth,
         scrollOver,
         typeKeys,
         attachFiles,
         fetchFile,
         watchAnswers,
         back,
         hover,
         drift,
      } = detector

      if (probe) {
         this.probe = () => probe.call(detector)
      }

      if (inspect) {
         this.inspect = options => inspect.call(detector, options)
      }

      if (clickLink) {
         this.clickLink = (href, avoid) => clickLink.call(detector, href, avoid)
      }

      if (clickInside) {
         this.clickInside = (box, avoid) => clickInside.call(detector, box, avoid)
      }

      if (clickSelector) {
         this.clickSelector = selector => clickSelector.call(detector, selector)
      }

      if (clickNth) {
         this.clickNth = (selector, index, avoid, bringIntoView) =>
            clickNth.call(detector, selector, index, avoid, bringIntoView)
      }

      if (scrollOver) {
         this.scrollOver = (selector, pixels) => scrollOver.call(detector, selector, pixels)
      }

      if (typeKeys) {
         this.typeKeys = text => typeKeys.call(detector, text)
      }

      if (attachFiles) {
         this.attachFiles = (selector, paths) => attachFiles.call(detector, selector, paths)
      }

      if (fetchFile) {
         this.fetchFile = (url, maxBytes) => fetchFile.call(detector, url, maxBytes)
      }

      if (watchAnswers) {
         this.watchAnswers = (method, parts) => watchAnswers.call(detector, method, parts)
      }

      if (back) {
         this.back = () => back.call(detector)
      }

      if (hover) {
         this.hover = (x, y) => hover.call(detector, x, y)
      }

      if (drift) {
         this.drift = () => drift.call(detector)
      }
   }

   public scrollBy(pixels: number) {
      return this.step('scroll', { pixels }, () => this.detector.scrollBy(pixels))
   }

   public pageText() {
      return this.detector.pageText()
   }

   public pageHtml() {
      return this.detector.pageHtml()
   }

   public fullPageScreenshot() {
      return this.detector.fullPageScreenshot()
   }

   public identity(): Promise<BrowserIdentity> {
      return this.detector.identity()
   }

   public storageState() {
      return this.detector.storageState()
   }
}
