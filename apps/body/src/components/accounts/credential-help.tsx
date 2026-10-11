import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'

const Steps = ({ title, steps }: { title: string; steps: string[] }) => (
   <div className="grid gap-1">
      <h4 className="text-sm font-medium">{title}</h4>
      <ol className="text-muted-foreground list-decimal space-y-1 pl-5 text-sm">
         {steps.map(step => (
            <li key={step}>{step}</li>
         ))}
      </ol>
   </div>
)

export const TotpHelp = () => (
   <Accordion type="single" collapsible>
      <AccordionItem value="totp" className="border-b-0">
         <AccordionTrigger className="py-2 text-sm">Where do I find my two-step key?</AccordionTrigger>
         <AccordionContent className="grid gap-3">
            <p className="text-muted-foreground text-sm">
               Only needed if you use an authenticator app to sign in to LinkedIn. You can leave this empty if you do
               not.
            </p>
            <Steps
               title="Get the key from LinkedIn"
               steps={[
                  'On LinkedIn, open Settings & Privacy, then Sign in & security, then Two-step verification.',
                  'Turn it off and on again to set up your authenticator app.',
                  'When LinkedIn shows the QR code, choose the option to enter a key manually. It shows a text key such as SWXC KS6W 42KV…',
                  'Copy that key and paste it here. Spaces are fine.',
               ]}
            />
            <p className="text-muted-foreground text-sm">
               Some apps can export a link that starts with otpauth://. You can paste that link instead of the key. If
               you can no longer see the key, you need to set two-step verification up again to get a new one.
            </p>
         </AccordionContent>
      </AccordionItem>
   </Accordion>
)

export const CookieHelp = () => (
   <Accordion type="single" collapsible>
      <AccordionItem value="cookie" className="border-b-0">
         <AccordionTrigger className="py-2 text-sm">How do I get this?</AccordionTrigger>
         <AccordionContent className="grid gap-4">
            <p className="text-muted-foreground text-sm">
               This is the small piece of text your browser keeps while you are signed in to LinkedIn, called{' '}
               <code className="bg-muted rounded px-1">li_at</code>. You do not have to find that one row: copy all the
               cookies in the table and paste them here, and we pick out the right one.
            </p>
            <Steps
               title="Chrome, Edge or Brave"
               steps={[
                  'Open linkedin.com and make sure you are signed in.',
                  'Press F12 (Windows) or Cmd + Option + I (Mac) to open Developer Tools.',
                  'Click the Application tab. If you do not see it, click the » arrows.',
                  'On the left, open Cookies, then click https://www.linkedin.com.',
                  'Click any row in the table, press Ctrl + A (Cmd + A on Mac), then Ctrl + C (Cmd + C), and paste here. Or double-click the Value of the li_at row and copy just that.',
               ]}
            />
            <Steps
               title="Firefox"
               steps={[
                  'Open linkedin.com and make sure you are signed in.',
                  'Press F12 and click the Storage tab.',
                  'Open Cookies, then click https://www.linkedin.com.',
                  'Find the li_at row, copy its Value, and paste it here.',
               ]}
            />
            <Steps
               title="Safari"
               steps={[
                  'Open Safari menu, Settings, Advanced, and turn on Show features for web developers.',
                  'Open linkedin.com and make sure you are signed in.',
                  'Open the Develop menu, choose Show Web Inspector, then the Storage tab.',
                  'Open Cookies, click www.linkedin.com, find li_at, copy its Value, and paste it here.',
               ]}
            />
            <p className="text-muted-foreground text-sm">
               The value is a long text, usually starting with AQ. Treat it like a password: anyone who has it can act
               as you on LinkedIn.
            </p>
         </AccordionContent>
      </AccordionItem>
   </Accordion>
)
