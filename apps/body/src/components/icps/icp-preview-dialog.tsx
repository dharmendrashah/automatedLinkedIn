import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { readableError } from '@/lib/trpc-error'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'

import { type Icp } from './icp-form'

import { trpc } from '../../trpc'

const PLACEHOLDER = 'Head of Growth at Acme | London, UK\nFounder, B2B SaaS | Berlin\nMarketing intern'

const PreviewForm = ({ icp }: { icp: Icp }) => {
   const [samples, setSamples] = useState('')
   const preview = trpc.icp.preview.useMutation()
   const result = preview.data

   return (
      <div className="grid gap-4">
         <div className="grid gap-2">
            <Label htmlFor="icp-samples">Sample people, one per line</Label>
            <Textarea
               id="icp-samples"
               rows={5}
               maxLength={20_000}
               placeholder={PLACEHOLDER}
               value={samples}
               onChange={event => setSamples(event.target.value)}
               aria-describedby="icp-samples-hint"
            />
            <p id="icp-samples-hint" className="text-muted-foreground text-xs">
               A headline, then optionally &quot; | &quot; and a location. Up to 50 lines.
            </p>
         </div>
         <Button
            className="justify-self-start"
            disabled={!samples.trim() || preview.isPending}
            onClick={() =>
               preview.mutate({
                  id: icp.id,
                  samples,
               })
            }
         >
            {preview.isPending ? <Loader2 className="animate-spin" /> : null}
            Score them
         </Button>
         {preview.error ? (
            <Alert variant="destructive">
               <AlertDescription>{readableError(preview.error)}</AlertDescription>
            </Alert>
         ) : null}
         {result ? (
            <>
               <div className="overflow-hidden rounded-lg border">
                  <Table>
                     <TableHeader className="bg-muted/50">
                        <TableRow>
                           <TableHead>Person</TableHead>
                           <TableHead className="w-24">Score</TableHead>
                           <TableHead>Why</TableHead>
                        </TableRow>
                     </TableHeader>
                     <TableBody>
                        {result.results.map((row, index) => (
                           <TableRow key={index}>
                              <TableCell>
                                 {row.headline ?? '(no headline)'}
                                 {row.location ? (
                                    <p className="text-muted-foreground text-xs">{row.location}</p>
                                 ) : null}
                              </TableCell>
                              <TableCell>
                                 {row.disqualified ? (
                                    <Badge variant="destructive">Left out</Badge>
                                 ) : (
                                    `${row.score} / ${result.maxScore}`
                                 )}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                 {row.matched.length > 0 ? row.matched.join(', ') : 'Nothing matched'}
                              </TableCell>
                           </TableRow>
                        ))}
                     </TableBody>
                  </Table>
               </div>
               <p className="text-muted-foreground text-xs">
                  A headline and a location can reach {result.maxScore} of 100. Industry, company size and how the
                  person engaged are scored when a workflow reads more about them.
               </p>
            </>
         ) : null}
      </div>
   )
}

type Props = {
   icp: Icp | null
   onClose: () => void
}

export const IcpPreviewDialog = ({ icp, onClose }: Props) => (
   <Dialog open={Boolean(icp)} onOpenChange={next => (next ? undefined : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
         <DialogHeader>
            <DialogTitle>Try {icp?.name}</DialogTitle>
            <DialogDescription>Paste a few people to see how they would score.</DialogDescription>
         </DialogHeader>
         {icp ? <PreviewForm key={icp.id} icp={icp} /> : null}
      </DialogContent>
   </Dialog>
)
