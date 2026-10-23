import { ExternalLink } from 'lucide-react'
import { Fragment } from 'react'

import { linkify } from './links'
import { highlight } from './search'

type Props = {
   text: string
   // Words to mark (the search), when there are any.
   tokens?: string[]
}

const Marked = ({ text, tokens }: { text: string; tokens: string[] }) => (
   <>
      {highlight(text, tokens).map((piece, index) =>
         piece.match ? (
            <mark key={index} className="rounded-sm bg-warning/25 px-0.5 text-inherit">
               {piece.text}
            </mark>
         ) : (
            <Fragment key={index}>{piece.text}</Fragment>
         )
      )}
   </>
)

// A message's words as text. Nothing is ever put in as markup: a link is made only for an http or https address, shows its real host,
// opens in a new tab without telling the page it came from, and is never fetched here.
export const RichText = ({ text, tokens = [] }: Props) => (
   <>
      {linkify(text).map((piece, index) =>
         piece.type === 'text' ? (
            <Marked key={index} text={piece.text} tokens={tokens} />
         ) : (
            <a
               key={index}
               href={piece.href}
               target="_blank"
               rel="noopener noreferrer nofollow"
               title={piece.shortened ? `Shortened link to ${piece.domain}: the real address is hidden` : piece.href}
               className="inline-flex max-w-full items-center gap-0.5 break-all text-primary underline underline-offset-2"
            >
               {piece.text}
               <ExternalLink className="size-3 shrink-0" aria-hidden />
               {piece.shortened ? (
                  <span className="rounded bg-warning/15 px-1 text-[10px] text-warning no-underline">shortened</span>
               ) : null}
            </a>
         )
      )}
   </>
)

export { Marked }
