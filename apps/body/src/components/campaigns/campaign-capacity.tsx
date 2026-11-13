import { Link } from 'react-router'

import type { CampaignInsights } from '@automatedLinkedIn/contracts'

import { missingSetupItems } from './campaign-insights'

export const CampaignCapacity = ({ capacity }: { capacity: CampaignInsights['capacity'] }) => {
   const setup = missingSetupItems(capacity.missing)
   return (
      <div className="grid gap-3">
         <p>
            Your accounts can send up to {capacity.perDay} invites a day ({capacity.perWeek} a week) across{' '}
            {capacity.usableAccounts} {capacity.usableAccounts === 1 ? 'account' : 'accounts'}.
         </p>
         <p className="text-muted-foreground text-sm">
            This campaign's share: {capacity.share.perDay} a day, {capacity.share.perWeek} a week.
         </p>
         {setup.length > 0 && (
            <ul className="grid gap-1 text-sm">
               {setup.map(item => (
                  <li key={item.label}>
                     <Link className="underline" to={item.to}>
                        {item.label}
                     </Link>
                  </li>
               ))}
            </ul>
         )}
      </div>
   )
}
