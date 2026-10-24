import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FlaskConical } from 'lucide-react'

import { SAMPLE_KINDS, SAMPLE_LABELS, type SampleKind } from './source'

type Props = {
   kind: SampleKind
   onChange: (kind: SampleKind) => void
}

// Until the profile can be read from LinkedIn, the page shows an invented one. It says so, and lets the reviewer try the three
// situations: a full profile, a new account and a profile never read.
export const SampleBanner = ({ kind, onChange }: Props) => (
   <Alert>
      <FlaskConical />
      <AlertTitle>Preview with sample data</AlertTitle>
      <AlertDescription>
         <p>
            This profile is invented, not the one on LinkedIn. The real profile of this account shows here once reading
            it is built.
         </p>
         <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Sample to show">
            {SAMPLE_KINDS.map(option => (
               <Button
                  key={option}
                  size="sm"
                  variant={option === kind ? 'secondary' : 'outline'}
                  aria-pressed={option === kind}
                  onClick={() => onChange(option)}
               >
                  {SAMPLE_LABELS[option]}
               </Button>
            ))}
         </div>
      </AlertDescription>
   </Alert>
)
