import { CompanyView } from '@/components/companies/company-view'
import { WIDE, floatingDrawer } from '@/components/floating-drawer'
import { PersonBySlug } from '@/components/my-network/person-by-slug'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent } from '@/components/ui/drawer'
import { ArrowLeft } from 'lucide-react'
import { type ReactNode, useCallback, useState } from 'react'
import { useLocation } from 'react-router'

import { trpc } from '../../trpc'
import { MissingCompany } from './missing-company'
import { DetailStackContext, type StackRef } from './use-detail-stack'

const BACK: Record<StackRef['kind'], string> = {
   person: 'Back to the person',
   company: 'Back to the company',
   unknownCompany: 'Back to the company',
}

// A company of /companies; one the owner does not have yet can be added from here.
const StackCompany = ({
   slug,
   name,
   onPerson,
   onAdded,
}: {
   slug: string
   name: string | undefined
   onPerson: (slug: string) => void
   onAdded: (slug: string) => void
}) => {
   const detail = trpc.companyPage.detail.useQuery({ slug }, { retry: false })

   return detail.error?.data?.code === 'NOT_FOUND' ? (
      <MissingCompany name={name ?? slug} slug={slug} onAdded={onAdded} />
   ) : (
      <CompanyView slug={slug} onPerson={onPerson} />
   )
}

// A second drawer over the page's own: the top of a small stack of companies and people opened from inside a drawer. Back goes
// one step down; closing it, or opening another page, leaves the drawer underneath as it was.
export const DetailStackProvider = ({ children }: { children: ReactNode }) => {
   const { pathname } = useLocation()
   // Kept with the page it was opened on, so another page starts with an empty stack.
   const [state, setState] = useState<{ pathname: string; stack: StackRef[] }>({
      pathname,
      stack: [],
   })
   const stack = state.pathname === pathname ? state.stack : []
   const change = useCallback(
      (next: (current: StackRef[]) => StackRef[]) =>
         setState(current => ({
            pathname,
            stack: next(current.pathname === pathname ? current.stack : []),
         })),
      [pathname]
   )
   const push = useCallback((ref: StackRef) => change(current => [...current, ref]), [change])
   const close = () => change(() => [])
   const showPerson = (slug: string) =>
      push({
         kind: 'person',
         slug,
      })
   // An added company takes the place of the one it was missing for.
   const showAdded = (slug: string) =>
      change(current => [
         ...current.slice(0, -1),
         {
            kind: 'company',
            slug,
         },
      ])
   const top = stack.at(-1)

   return (
      <DetailStackContext value={push}>
         {children}
         <Drawer direction="right" open={Boolean(top)} onOpenChange={open => (open ? undefined : close())}>
            <DrawerContent className={floatingDrawer(WIDE)}>
               <div className="grid gap-3 overflow-y-auto p-4">
                  <Button
                     variant="ghost"
                     size="sm"
                     className="justify-self-start"
                     onClick={() => change(current => current.slice(0, -1))}
                  >
                     <ArrowLeft />
                     {BACK[stack.at(-2)?.kind ?? 'person']}
                  </Button>
                  {top?.kind === 'company' ? (
                     <StackCompany
                        key={`${stack.length}-${top.slug}`}
                        slug={top.slug}
                        name={top.name}
                        onPerson={showPerson}
                        onAdded={showAdded}
                     />
                  ) : null}
                  {top?.kind === 'unknownCompany' ? (
                     <MissingCompany
                        key={`${stack.length}-${top.name}`}
                        name={top.name}
                        slug={null}
                        onAdded={showAdded}
                     />
                  ) : null}
                  {top?.kind === 'person' ? (
                     <PersonBySlug key={`${stack.length}-${top.slug}`} slug={top.slug} onClose={close} />
                  ) : null}
               </div>
            </DrawerContent>
         </Drawer>
      </DetailStackContext>
   )
}
