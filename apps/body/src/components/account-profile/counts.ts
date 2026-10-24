const compact = new Intl.NumberFormat('en', {
   notation: 'compact',
   maximumFractionDigits: 1,
})
const full = new Intl.NumberFormat('en')

// "905", "1.5K", "12M": for a count that has to fit in a small place.
export const compactCount = (value: number) => compact.format(value)

// "954,799": for a count that is the point of the line.
export const fullCount = (value: number) => full.format(value)
