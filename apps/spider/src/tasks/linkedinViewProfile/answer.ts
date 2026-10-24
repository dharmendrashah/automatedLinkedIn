import { type ViewOutcome, answerForView } from '../../linkedin/viewPage'
import { type TaskOutcome } from '../defineTask'

export const answerFor = (outcome: ViewOutcome): TaskOutcome => answerForView(outcome, 'profile')
