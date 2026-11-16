import type { DashboardOverview } from '@automatedLinkedIn/contracts'

import { CampaignsPanel } from './campaigns-panel'
import { type TabEntry } from './dashboard-table'

const HIDEABLE: Array<[string, string]> = [
   ['campaign', 'Campaign'],
   ['state', 'State'],
   ['status', 'Status'],
   ['qualified', 'Qualified (30 days)'],
   ['invited', 'Invited (30 days)'],
   ['pipeline', 'Pipeline'],
]

// `onChanged` rereads the overview and the campaign list after a Pause or Resume.
export const campaignsTab = ({
   rows,
   onChanged,
}: {
   rows: DashboardOverview['campaigns']
   generatedAt: string
   onChanged: () => Promise<unknown>
}): TabEntry => ({
   key: 'campaigns',
   label: 'Campaigns',
   count: rows.length,
   hideable: HIDEABLE,
   content: hidden => <CampaignsPanel rows={rows} onChanged={onChanged} hidden={hidden} />,
})
