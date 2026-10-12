import { type BrowserIdentity, type DetectionSession } from '../scraping/driver'
import { RecordedSession } from './recordedSession'
import { type Recorder } from './recorder'

// A recorded session that can also scroll: each scroll is a step with a screenshot of where it ended. Reading the page and
// the full-page picture are passed through, because the browser test saves those itself.
export class RecordedDetectionSession extends RecordedSession implements DetectionSession {
   public constructor(
      private readonly detector: DetectionSession,
      recorder: Pick<Recorder, 'addStep' | 'log' | 'addSecret' | 'saveScreenshot' | 'saveFailureHtml'>
   ) {
      super(detector, recorder)
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
}
