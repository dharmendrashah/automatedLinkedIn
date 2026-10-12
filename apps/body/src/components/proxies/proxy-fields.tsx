import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import { type ProxyProtocol } from './types'

const protocols: ProxyProtocol[] = ['HTTP', 'HTTPS', 'SOCKS4', 'SOCKS5']

export type ProxyFieldValues = {
   protocol: ProxyProtocol
   host: string
   port: string
   username: string
   password: string
}

type Props = {
   idPrefix: string
   values: ProxyFieldValues
   onChange: (patch: Partial<ProxyFieldValues>) => void
   // Shown in the password field instead of a value when editing: leaving it blank keeps the stored one.
   passwordPlaceholder?: string
}

export const ProxyFields = ({ idPrefix, values, onChange, passwordPlaceholder }: Props) => (
   <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-4">
         <div className="grid gap-2">
            <Label htmlFor={`${idPrefix}-protocol`}>Protocol</Label>
            <Select value={values.protocol} onValueChange={value => onChange({ protocol: value as ProxyProtocol })}>
               <SelectTrigger id={`${idPrefix}-protocol`} className="w-full">
                  <SelectValue />
               </SelectTrigger>
               <SelectContent>
                  {protocols.map(protocol => (
                     <SelectItem key={protocol} value={protocol}>
                        {protocol.toLowerCase()}://
                     </SelectItem>
                  ))}
               </SelectContent>
            </Select>
         </div>
         <div className="grid gap-2">
            <Label htmlFor={`${idPrefix}-port`}>Port</Label>
            <Input
               id={`${idPrefix}-port`}
               type="number"
               min={1}
               max={65535}
               value={values.port}
               onChange={event => onChange({ port: event.target.value })}
               required
            />
         </div>
      </div>

      <div className="grid gap-2">
         <Label htmlFor={`${idPrefix}-host`}>Host</Label>
         <Input
            id={`${idPrefix}-host`}
            placeholder="proxy.example.net or 203.0.113.9"
            value={values.host}
            onChange={event => onChange({ host: event.target.value })}
            autoComplete="off"
            required
         />
      </div>

      <div className="grid grid-cols-2 gap-4">
         <div className="grid gap-2">
            <Label htmlFor={`${idPrefix}-username`}>Username (optional)</Label>
            <Input
               id={`${idPrefix}-username`}
               value={values.username}
               onChange={event => onChange({ username: event.target.value })}
               autoComplete="off"
            />
         </div>
         <div className="grid gap-2">
            <Label htmlFor={`${idPrefix}-password`}>Password (optional)</Label>
            <Input
               id={`${idPrefix}-password`}
               type="password"
               value={values.password}
               onChange={event => onChange({ password: event.target.value })}
               placeholder={passwordPlaceholder}
               autoComplete="new-password"
            />
         </div>
      </div>

      <p className="text-muted-foreground text-xs">
         Prefer a residential proxy with a sticky (not rotating) session: LinkedIn is more likely to flag an account
         whose address changes between visits, or that connects from a datacenter.
      </p>
      <p className="text-muted-foreground text-xs">
         Only use a proxy you trust. Everything an account sends through it, including its password, passes through the
         proxy, and we do not check the security certificate it presents.
      </p>
   </div>
)
