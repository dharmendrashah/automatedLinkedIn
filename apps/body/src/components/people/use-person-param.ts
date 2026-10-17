import { useSearchParams } from 'react-router'

// The person shown in the drawer lives in the URL (?person=<slug>), so a reload or a shared link opens it again.
export const usePersonParam = () => {
   const [params, setParams] = useSearchParams()
   const slug = params.get('person')

   const set = (next: string | null) =>
      setParams(
         current => {
            const updated = new URLSearchParams(current)

            if (next) {
               updated.set('person', next)
            } else {
               updated.delete('person')
            }

            return updated
         },
         { replace: true }
      )

   return [slug, set] as const
}
