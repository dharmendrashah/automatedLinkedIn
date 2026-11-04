import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Plus, X } from 'lucide-react'

// The texts of "From my texts": one box each, with variables like {author_first_name} and spintax like {Great|Good}. The block checks
// every version against the limit of LinkedIn.
export const TextsField = ({
   id,
   value,
   max,
   chars,
   onChange,
}: {
   id: string
   value: string[]
   max: number
   chars: number
   onChange: (next: string[]) => void
}) => {
   const texts = value.length > 0 ? value : ['']
   const change = (at: number, text: string) => onChange(texts.map((each, index) => (index === at ? text : each)))

   return (
      <div className="grid gap-2" id={id}>
         {texts.map((text, at) => (
            <div key={at} className="grid gap-1">
               <div className="flex items-start gap-2">
                  <Textarea
                     aria-label={`Text ${at + 1}`}
                     value={text}
                     placeholder="Great point, {author_first_name}. Which part took longest?"
                     onChange={event => change(at, event.target.value)}
                  />
                  {texts.length > 1 ? (
                     <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove text ${at + 1}`}
                        onClick={() => onChange(texts.filter((_each, index) => index !== at))}
                     >
                        <X />
                     </Button>
                  ) : null}
               </div>
               <p className="text-muted-foreground text-xs">{`${text.length} characters written; each version must stay under ${chars}.`}</p>
            </div>
         ))}
         {texts.length < max ? (
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => onChange([...texts, ''])}>
               <Plus />
               Add a text
            </Button>
         ) : null}
      </div>
   )
}
