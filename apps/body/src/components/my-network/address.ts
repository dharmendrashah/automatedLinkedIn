// What My network shows lives in the address (tab, filters, search, open person), so old pages can redirect into a
// filter and a reload keeps the view.

export const TABS = ['NEEDS_ME', 'WAITING', 'EVERYONE', 'DO_NOT_CONTACT'] as const
export const FITS = ['STRONG', 'MAYBE', 'NONE'] as const
export const SORTS = ['name', 'connectedAt', 'lastSentAt', 'lastReceivedAt', 'lastTouchAt', 'firstSeenAt'] as const

export type Tab = (typeof TABS)[number]
export type Fit = (typeof FITS)[number]
export type Sort = { by: (typeof SORTS)[number]; desc: boolean }

// The tabs of the person drawer.
export const PANES = ['chat', 'profile', 'history', 'data'] as const

export type Pane = (typeof PANES)[number]

export type View = {
   tab: Tab
   found?: string
   fit?: Fit
   label?: string
   q?: string
   onlyNew: boolean
   open: string | null
   // A column sort (`sort=name`, `sort=-lastTouchAt` for newest first); the Filters panel is `filters`, read by the page.
   sort?: Sort
}

const isTab = (value: string | null): value is Tab => TABS.some(tab => tab === value)
const isFit = (value: string | null): value is Fit => FITS.some(fit => fit === value)
const text = (value: string | null) => value?.trim() || undefined

const readSort = (value: string | null): Sort | undefined => {
   const desc = value?.startsWith('-') ?? false
   const by = SORTS.find(sort => sort === (desc ? value?.slice(1) : value))

   return by
      ? {
           by,
           desc,
        }
      : undefined
}

export const sortParam = (sort: Sort | undefined) => (sort ? `${sort.desc ? '-' : ''}${sort.by}` : null)

export const readView = (params: URLSearchParams): View => {
   const tab = params.get('tab')?.toUpperCase() ?? null
   const fit = params.get('fit')?.toUpperCase() ?? null

   return {
      tab: isTab(tab) ? tab : 'EVERYONE',
      found: text(params.get('found')),
      fit: isFit(fit) ? fit : undefined,
      label: text(params.get('label')),
      q: text(params.get('q')),
      onlyNew: params.get('new') === '1',
      open: text(params.get('open')) ?? null,
      sort: readSort(params.get('sort')),
   }
}

export type ViewChange = Partial<
   Record<'tab' | 'found' | 'fit' | 'label' | 'q' | 'new' | 'open' | 'filters' | 'sort', string | null>
>

// A copy of the address with these keys set, or removed when null or empty.
export const changeView = (params: URLSearchParams, change: ViewChange) => {
   const next = new URLSearchParams(params)

   for (const [key, value] of Object.entries(change)) {
      if (value) {
         next.set(key, key === 'tab' || key === 'fit' ? value.toLowerCase() : value)
      } else {
         next.delete(key)
      }
   }

   return next
}

// The list that Found by points at, if it is one.
export const pickedList = <L extends { id: string }>(found: string | undefined, lists: L[]) =>
   found?.startsWith('list:') ? lists.find(({ id }) => `list:${id}` === found) : undefined

// `/lists?list=<id>` becomes Found by that list.
export const listsRedirect = (search: string) => {
   const list = new URLSearchParams(search).get('list')?.trim()

   return list ? `/network?found=${encodeURIComponent(`list:${list}`)}` : '/network'
}
