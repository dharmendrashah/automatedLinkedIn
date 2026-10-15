import { type BrowserIdentity, type DetectionSession, type ProbeReading } from '../scraping/driver'
import { RecordedSession } from './recordedSession'
import { type Recorder } from './recorder'

// A recorded session that can also scroll: each scroll is a step with a screenshot of where it ended. Reading the page and
// the full-page picture are passed through, because the browser test saves those itself.
export class RecordedDetectionSession extends RecordedSession implements DetectionSession {
   // Present only when the browser can be probed, so a task can tell.
   public readonly probe?: () => Promise<ProbeReading>

   public constructor(
      private readonly detector: DetectionSession,
      recorder: Pick<Recorder, 'addStep' | 'log' | 'addSecret' | 'saveScreenshot' | 'saveFailureHtml'>
   ) {
      super(detector, recorder)

      const { probe } = detector

      if (probe) {
         this.probe = () => probe.call(detector)
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
