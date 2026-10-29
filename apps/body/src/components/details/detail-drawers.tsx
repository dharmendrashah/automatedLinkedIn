import { CompanyView } from '@/components/companies/company-view'
import { floatingDrawer } from '@/components/floating-drawer'
import { PersonView } from '@/components/people/person-view'
import { PostView } from '@/components/posts/post-view'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerFooter } from '@/components/ui/drawer'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'

import { type DetailKind, useDetailDrawer } from './use-detail-drawer'

const BACK_LABELS: Record<DetailKind, string> = {
   person: 'Back to the person',
   company: 'Back to the company',
   post: 'Back to the post',
}

type Props = {
   // What the page's table lists, in order, for Previous and Next.
   kind: DetailKind
   order: string[]
   // Stays open beside the list while the owner keeps working it, instead of covering the page.
   docked?: boolean
   // Asks before a paid read (the Unibox, where a read is a side step).
   confirmRead?: boolean
}

// The one detail drawer of a page: a person, a company or a post, like their LinkedIn page. A person opened from a
// company or post replaces it, with a way back.
export const DetailDrawers = ({ kind, order, docked = false, confirmRead = false }: Props) => {
   const { open, back, show, close } = useDetailDrawer()
   const index = open?.kind === kind ? order.indexOf(open.slug) : -1
   const previous = index > 0 ? order[index - 1] : undefined
   const next = index >= 0 && index < order.length - 1 ? order[index + 1] : undefined
   const toPerson = (slug: string) => (open ? show('person', slug, open) : undefined)

   return (
      <Drawer
         direction="right"
         modal={!docked}
         open={Boolean(open)}
         onOpenChange={isOpen => (isOpen ? undefined : close())}
      >
         <DrawerContent
            className={floatingDrawer('sm:max-w-xl')}
            onInteractOutside={docked ? event => event.preventDefault() : undefined}
         >
            <div className="grid gap-3 overflow-y-auto p-4">
               {back ? (
                  <Button
                     variant="ghost"
                     size="sm"
                     className="justify-self-start"
                     onClick={() => show(back.kind, back.slug)}
                  >
                     <ArrowLeft />
                     {BACK_LABELS[back.kind]}
                  </Button>
               ) : null}
               {open?.kind === 'person' ? (
                  <PersonView key={open.slug} slug={open.slug} confirmRead={confirmRead} />
               ) : null}
               {open?.kind === 'company' ? <CompanyView key={open.slug} slug={open.slug} onPerson={toPerson} /> : null}
               {open?.kind === 'post' ? <PostView key={open.slug} slug={open.slug} onPerson={toPerson} /> : null}
            </div>
            {order.length > 0 ? (
               <DrawerFooter className="flex-row justify-between border-t">
                  <Button
                     variant="outline"
                     size="sm"
                     disabled={!previous}
                     onClick={() => (previous ? show(kind, previous) : undefined)}
                  >
                     <ChevronLeft />
                     Previous
                  </Button>
                  <span className="text-muted-foreground self-center text-xs">
                     {index >= 0 ? `${index + 1} of ${order.length}` : ''}
                  </span>
                  <Button
                     variant="outline"
                     size="sm"
                     disabled={!next}
                     onClick={() => (next ? show(kind, next) : undefined)}
                  >
                     Next
                     <ChevronRight />
                  </Button>
               </DrawerFooter>
            ) : null}
         </DrawerContent>
      </Drawer>
   )
}
