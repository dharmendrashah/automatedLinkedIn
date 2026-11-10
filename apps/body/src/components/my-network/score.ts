// The score bands of My network (.plan/network-score-filter.md): a copy of the contract's (contracts are not bundled into the page);
// `score.unit.test.ts` keeps the two equal.

export const SCORE_BANDS = ['RED', 'YELLOW', 'GREEN'] as const

export type ScoreBand = (typeof SCORE_BANDS)[number]

export const SCORE_BAND_FROM = { YELLOW: 40, GREEN: 70 } as const

export const SCORE_WORDS: Record<ScoreBand, string> = {
   RED: 'Red, under 40',
   YELLOW: 'Yellow, 40 to 69',
   GREEN: 'Green, 70 and up',
}

export const SCORE_NAMES: Record<ScoreBand, string> = {
   RED: 'Red',
   YELLOW: 'Yellow',
   GREEN: 'Green',
}

export const scoreBandOf = (score: number): ScoreBand =>
   score >= SCORE_BAND_FROM.GREEN ? 'GREEN' : score >= SCORE_BAND_FROM.YELLOW ? 'YELLOW' : 'RED'

// The text a screen reader gets for the score bar.
export const scoreLabel = (score: number | null): string =>
   score === null ? 'No score' : `Score ${score} of 100, ${SCORE_NAMES[scoreBandOf(score)]}`
