import { type UniboxAccount } from './types'

const STATE_LABELS: Record<UniboxAccount['state'], string> = {
   ACTIVE: 'Signed in',
   PAUSED: 'Paused',
   DISCONNECTED: 'Disconnected',
   RESTRICTED: 'Restricted by LinkedIn',
}

export const stateLabel = (state: UniboxAccount['state']) => STATE_LABELS[state]
