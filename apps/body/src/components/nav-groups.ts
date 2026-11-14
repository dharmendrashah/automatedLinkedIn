import {
   Activity,
   Briefcase,
   Building2,
   ClipboardCheck,
   FileText,
   Inbox,
   LayoutDashboard,
   Megaphone,
   Network,
   SquarePen,
   Target,
   Timer,
   UserCircle,
   UserPlus,
   Video,
   Wallet,
   Workflow as WorkflowIcon,
} from 'lucide-react'

import type { NavItem } from './nav-main'

export type NavGroup = {
   label: string
   // Written out in full so Tailwind sees it; a light and a dark shade keep the icon readable in both themes.
   iconClass: string
   items: NavItem[]
}

const APPROVE = '/approve'

// Only the platform owner sees it; the page and the API refuse everyone else as well.
const cronMonitor: NavItem = {
   title: 'Cron monitor',
   to: '/jobs',
   icon: Timer,
}

const GROUPS: NavGroup[] = [
   {
      label: 'Work',
      iconClass: 'text-blue-600 dark:text-blue-400',
      items: [
         { title: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
         { title: 'Unibox', to: '/unibox', icon: Inbox },
         { title: 'To approve', to: APPROVE, icon: ClipboardCheck },
      ],
   },
   {
      label: 'Outreach',
      iconClass: 'text-violet-600 dark:text-violet-400',
      items: [
         { title: 'Campaigns', to: '/campaigns', icon: Megaphone },
         { title: 'Workflows', to: '/workflows', icon: WorkflowIcon },
         { title: 'Ideal customers', to: '/icps', icon: Target },
         { title: 'Write a post', to: '/posting', icon: SquarePen },
      ],
   },
   {
      label: 'LinkedIn',
      iconClass: 'text-teal-600 dark:text-teal-400',
      items: [
         { title: 'My network', to: '/network', icon: UserPlus },
         { title: 'Accounts', to: '/accounts', icon: Briefcase },
         { title: 'Companies', to: '/companies', icon: Building2 },
         { title: 'Posts', to: '/posts', icon: FileText },
      ],
   },
   {
      label: 'Settings',
      iconClass: 'text-amber-600 dark:text-amber-400',
      items: [
         { title: 'Usage', to: '/usage', icon: Wallet },
         { title: 'Proxies', to: '/proxies', icon: Network },
         { title: 'Sessions', to: '/sessions', icon: Video },
         { title: 'Service status', to: '/healthstatus', icon: Activity },
         { title: 'Profile', to: '/profile', icon: UserCircle },
      ],
   },
]

// The menu for one user: the admin also gets the cron monitor (before Profile), and the approvals count rides on its own row.
export const groupsFor = ({ admin, waiting }: { admin: boolean; waiting?: number }): NavGroup[] =>
   GROUPS.map(group => ({
      ...group,
      items: group.items.flatMap(item => [
         ...(admin && item.to === '/profile' ? [cronMonitor] : []),
         item.to === APPROVE ? { ...item, badge: waiting } : item,
      ]),
   }))
