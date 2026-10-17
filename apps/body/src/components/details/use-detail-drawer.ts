import { useSearchParams } from 'react-router'

// Which detail drawer is open lives in the URL (?person=, ?company= or ?post=), so a reload or a shared link opens it
// again. `back` remembers the company or post a person was opened from.

export type DetailKind = 'person' | 'company' | 'post'

export type DetailRef = { kind: DetailKind; slug: string }

const KINDS: DetailKind[] = ['person', 'company', 'post']

const isKind = (value: string): value is DetailKind => KINDS.some(kind => kind === value)

const readRef = (value: string | null): DetailRef | null => {
   const at = value?.indexOf(':') ?? -1
   const kind = value?.slice(0, at) ?? ''
   const slug = value?.slice(at + 1) ?? ''

   return at > 0 && slug && isKind(kind)
      ? {
           kind,
           slug,
        }
      : null
}

export const useDetailDrawer = () => {
   const [params, setParams] = useSearchParams()
   const open =
      KINDS.flatMap(kind => {
         const slug = params.get(kind)

         return slug
            ? [
                 {
                    kind,
                    slug,
                 },
              ]
            : []
      })[0] ?? null
   const back = readRef(params.get('back'))

   const update = (change: (next: URLSearchParams) => void) =>
      setParams(
         current => {
            const next = new URLSearchParams(current)

            KINDS.forEach(kind => next.delete(kind))
            next.delete('back')
            change(next)

            return next
         },
         { replace: true }
      )

   // One drawer at a time: opening another replaces it, and `from` lets it come back.
   const show = (kind: DetailKind, slug: string, from?: DetailRef) =>
      update(next => {
         next.set(kind, slug)

         if (from) {
            next.set('back', `${from.kind}:${from.slug}`)
         }
      })

   const close = () => update(() => undefined)

   return {
      open,
      back,
      show,
      close,
   }
}
