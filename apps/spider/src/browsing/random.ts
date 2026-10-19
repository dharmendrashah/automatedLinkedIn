// A span of milliseconds, or pixels: the lowest and the highest.
export type Range = readonly [number, number]

export const between = (min: number, max: number, random: () => number) => min + Math.floor(random() * (max - min + 1))
