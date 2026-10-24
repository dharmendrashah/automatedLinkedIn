// The first few items of a list and what is left, for a card that opens the rest in place.
export const slice = <T>(items: readonly T[], shown: number, expanded: boolean) => ({
   visible: expanded ? items : items.slice(0, shown),
   hidden: Math.max(0, items.length - shown),
})

// How many there are in all: LinkedIn's own total when the page showed one, never less than what was kept.
export const totalOf = ({ items, total }: { items: readonly unknown[]; total?: number }) =>
   Math.max(total ?? 0, items.length)
