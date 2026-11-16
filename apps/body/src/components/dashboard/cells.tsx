export const Dash = () => <span className="text-muted-foreground">—</span>

// A count, or a dash when the number is not known.
export const Count = ({ value }: { value: number | null }) =>
   value === null ? <Dash /> : <span className="tabular-nums">{value}</span>
