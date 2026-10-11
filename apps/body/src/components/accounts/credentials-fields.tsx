import { CookieHelp, TotpHelp } from '@/components/accounts/credential-help'
import { type Flags, type SecretKey, type Values, noFlags } from '@/components/accounts/credential-rules'
import { MethodCard } from '@/components/accounts/method-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { type ChangeEvent } from 'react'

type Props = {
   idPrefix: string
   values: Values
   onChange: (key: SecretKey, value: string) => void
   // Edit mode: which secrets are already stored, and which are marked for removal.
   saved?: Flags
   cleared?: Flags
   onRemove?: (key: SecretKey) => void
   onUndo?: (key: SecretKey) => void
}

type NoteProps = {
   secret: boolean
   removed: boolean
   onRemove?: () => void
   onUndo?: () => void
}

const SavedNote = ({ secret, removed, onRemove, onUndo }: NoteProps) => {
   if (removed) {
      return (
         <p className="text-muted-foreground flex items-center gap-2 text-xs">
            Will be removed when you save.
            <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onUndo}>
               Undo
            </Button>
         </p>
      )
   }

   if (!secret) return null

   return (
      <p className="text-muted-foreground flex items-center gap-2 text-xs">
         Saved. Leave blank to keep it, or type to replace it.
         <Button
            type="button"
            variant="link"
            size="sm"
            className="text-destructive h-auto p-0 text-xs"
            onClick={onRemove}
         >
            Remove
         </Button>
      </p>
   )
}

export const CredentialsFields = ({
   idPrefix,
   values,
   onChange,
   saved = noFlags,
   cleared = noFlags,
   onRemove,
   onUndo,
}: Props) => {
   const change = (key: SecretKey) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(key, event.target.value)

   const note = (key: SecretKey) => (
      <SavedNote
         secret={saved[key] && !cleared[key]}
         removed={cleared[key]}
         onRemove={() => onRemove?.(key)}
         onUndo={() => onUndo?.(key)}
      />
   )

   const placeholder = (key: SecretKey, fallback: string) => (saved[key] && !cleared[key] ? 'Saved' : fallback)

   return (
      <>
         <MethodCard
            title="Option A: Email and password"
            description="The same password you type on LinkedIn."
            done={Boolean(values.password) || (saved.password && !cleared.password)}
         >
            <div className="grid gap-2">
               <Label htmlFor={`${idPrefix}-password`}>Password</Label>
               <Input
                  id={`${idPrefix}-password`}
                  type="password"
                  autoComplete="new-password"
                  placeholder={placeholder('password', '')}
                  disabled={cleared.password}
                  value={values.password}
                  onChange={change('password')}
               />
               {note('password')}
            </div>
            <div className="grid gap-2">
               <Label htmlFor={`${idPrefix}-totp`}>Two-step verification key (optional)</Label>
               <Input
                  id={`${idPrefix}-totp`}
                  type="password"
                  autoComplete="off"
                  placeholder={placeholder('totpSecret', 'Paste the key or the otpauth:// link')}
                  disabled={cleared.totpSecret}
                  value={values.totpSecret}
                  onChange={change('totpSecret')}
               />
               {note('totpSecret')}
               <TotpHelp />
            </div>
         </MethodCard>

         <div className="flex items-center gap-3" role="separator" aria-label="and or">
            <Separator className="flex-1" />
            <span className="text-muted-foreground text-xs font-medium uppercase">and / or</span>
            <Separator className="flex-1" />
         </div>

         <MethodCard
            title="Option B: Browser sign-in token"
            description="Lets us use the LinkedIn session your browser already has, without your password."
            done={Boolean(values.session.trim()) || (saved.session && !cleared.session)}
         >
            <div className="grid gap-2">
               <Label htmlFor={`${idPrefix}-session`}>Cookies or the li_at value</Label>
               <Textarea
                  id={`${idPrefix}-session`}
                  rows={4}
                  spellCheck={false}
                  autoComplete="off"
                  className="font-mono text-xs"
                  placeholder={placeholder('session', 'Paste the li_at value, or all your LinkedIn cookies')}
                  disabled={cleared.session}
                  value={values.session}
                  onChange={change('session')}
               />
               {note('session')}
               <CookieHelp />
            </div>
         </MethodCard>
      </>
   )
}
