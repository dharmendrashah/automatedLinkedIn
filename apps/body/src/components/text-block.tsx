// Small labelled blocks for text that comes from outside (a proxy, LinkedIn, the browser). It is always text in a
// <pre>, never HTML.
export const SectionLabel = ({ children }: { children: string }) => (
   <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{children}</h3>
)

export const TextBlock = ({ title, children }: { title: string; children: string }) => (
   <section className="grid gap-1.5">
      <SectionLabel>{title}</SectionLabel>
      <pre className="bg-muted/40 max-h-64 overflow-auto rounded-lg border p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">
         {children}
      </pre>
   </section>
)
