import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PenLine } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { type Identity } from '../posting/accounts'
import { Composer } from '../posting/composer'
import { composerOf } from '../posting/draft'
import { readPostBlocks } from '../posting/post-config'
import { PostPreview } from '../posting/post-preview'
import { summaryOf } from '../posting/summary'
import { usePostWriter } from '../posting/use-post-writer'

// Which account posts is decided when the run reaches the block, so the writer shows no one in particular.
const ANY_ACCOUNT: Identity = {
   name: 'One of your accounts',
   headline: undefined,
   imageUrl: undefined,
   known: false,
}

type Props = {
   value: string
   onChange: (next: string) => void
   onClose: () => void
}

// The same writer as the Posting page, in a dialog. Every change applies at once, like the other settings of a block; the canvas's
// Save keeps them. It cannot be closed while a file is still uploading, so the block never keeps a file that has no key.
const PostWriter = ({ value, onChange, onClose }: Props) => {
   const writer = usePostWriter(composerOf(readPostBlocks(value)))
   const { uploading } = writer
   const json = JSON.stringify(writer.blocks)
   const first = useRef(true)

   useEffect(() => {
      if (first.current) {
         first.current = false

         return
      }

      if (json !== value) {
         onChange(json)
      }
   }, [json, value, onChange])

   return (
      <Dialog open onOpenChange={next => (next || uploading > 0 ? undefined : onClose())}>
         <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-6xl">
            <DialogHeader>
               <DialogTitle>Write the post</DialogTitle>
               <DialogDescription>
                  It is posted once per run, from one of the accounts you chose. Changes apply as you type.
               </DialogDescription>
            </DialogHeader>
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
               <Composer
                  header={<p className="text-sm font-medium">From one of the accounts you chose</p>}
                  {...writer.composer}
                  footer={
                     <p role="status" className="text-muted-foreground text-sm">
                        {uploading > 0 ? `Uploading ${uploading} ${uploading === 1 ? 'file' : 'files'}…` : 'Saved with the workflow'}
                     </p>
                  }
               />
               <div className="grid gap-2">
                  <p className="text-muted-foreground text-xs">Preview. LinkedIn may fold long text a little differently.</p>
                  <PostPreview identity={ANY_ACCOUNT} blocks={writer.blocks} urls={writer.urls} width="desktop" />
               </div>
            </div>
            <DialogFooter>
               <Button type="button" disabled={uploading > 0} onClick={onClose}>
                  Done
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   )
}

// The setting of a "Write a post" block: what is written, short, and a button to open the writer.
export const PostField = ({ id, value, onChange }: { id: string; value: string; onChange: (next: string) => void }) => {
   const [open, setOpen] = useState(false)
   const blocks = readPostBlocks(value)
   const { words, attachment } = summaryOf(blocks)

   return (
      <div className="grid gap-2">
         <p className="text-muted-foreground text-sm" dir="auto">
            {blocks.length === 0 ? 'Nothing written yet.' : [words, attachment].filter(Boolean).join(' · ')}
         </p>
         <div>
            <Button id={id} type="button" variant="outline" onClick={() => setOpen(true)}>
               <PenLine />
               {blocks.length === 0 ? 'Write the post' : 'Edit the post'}
            </Button>
         </div>
         {open ? <PostWriter value={value} onChange={onChange} onClose={() => setOpen(false)} /> : null}
      </div>
   )
}
