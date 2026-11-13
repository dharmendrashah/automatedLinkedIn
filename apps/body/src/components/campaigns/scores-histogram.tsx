import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Label } from '@/components/ui/label'
import { Bar, BarChart, Cell, XAxis, YAxis } from 'recharts'

import { prefersReducedMotion } from './campaign-insights'

const chartConfig = {
   count: { label: 'People', color: 'var(--primary)' },
} satisfies ChartConfig

type ScoresHistogramProps = {
   histogram: number[]
   line: number
   passing: number
   onLineChange: (line: number) => void
}

export const ScoresHistogram = ({ histogram, line, passing, onLineChange }: ScoresHistogramProps) => {
   const firstPassing = Math.floor(line / 10)
   const data = histogram.map((count, bucket) => ({
      range: `${bucket * 10}-${bucket * 10 + 9}`,
      count,
      passes: bucket >= firstPassing,
   }))

   return (
      <section className="grid gap-2 rounded-xl border px-4 py-3">
         <h3 className="text-sm font-medium">Scores of the people found</h3>
         <ChartContainer config={chartConfig} className="aspect-auto h-32 w-full" aria-label="Scores in groups of ten">
            <BarChart data={data} margin={{ left: 0, right: 0 }}>
               <XAxis dataKey="range" tickLine={false} axisLine={false} tickMargin={6} interval={1} />
               <YAxis hide allowDecimals={false} />
               <ChartTooltip cursor={false} content={<ChartTooltipContent hideIndicator />} />
               <Bar dataKey="count" radius={4} isAnimationActive={!prefersReducedMotion()}>
                  {data.map(entry => (
                     <Cell
                        key={entry.range}
                        fill={entry.passes ? 'var(--color-count)' : 'var(--muted-foreground)'}
                        fillOpacity={entry.passes ? 1 : 0.35}
                     />
                  ))}
               </Bar>
            </BarChart>
         </ChartContainer>
         <div className="flex flex-wrap items-center gap-3 text-sm">
            <Label htmlFor="score-line">At or above</Label>
            <input
               id="score-line"
               type="range"
               min={0}
               max={90}
               step={10}
               value={line}
               onChange={event => onLineChange(Number(event.target.value))}
            />
            <span>{`${line}: ${passing} people`}</span>
         </div>
      </section>
   )
}
