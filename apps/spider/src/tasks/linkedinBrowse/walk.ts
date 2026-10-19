import { between } from '../linkedinLogin/browseAfterLogin'

export type Route = 'post' | 'profile' | 'post-profile'

export type Walk = {
   // How long the first read down the feed lasts.
   feedMs: number
   // The routes to take out of the feed and back, one per target.
   targets: Route[]
}

// How a day's walk differs from another: how long the feed is read first, how many targets, and which way into each.
const ROUTES: Array<[Route, number]> = [
   ['post', 35],
   ['profile', 30],
   ['post-profile', 35],
]
const FEED_MS = [120_000, 180_000] as const
const TARGETS = [5, 8] as const

const pickRoute = (random: () => number) => {
   const total = ROUTES.reduce((sum, [, weight]) => sum + weight, 0)
   let left = random() * total

   for (const [route, weight] of ROUTES) {
      if (left < weight) {
         return route
      }

      left -= weight
   }

   return 'post-profile'
}

export const planWalk = (random: () => number): Walk => ({
   feedMs: between(FEED_MS[0], FEED_MS[1], random),
   targets: Array.from({ length: between(TARGETS[0], TARGETS[1], random) }, () => pickRoute(random)),
})

// How long a person stays where they are, in milliseconds, and how much they pause between two small moves.
export const TIMING = {
   // On a post's own page, on a profile, and on the feed between two targets.
   post: [15_000, 40_000],
   profile: [12_000, 30_000],
   between: [10_000, 35_000],
   // Looking at a post in the feed before opening it.
   notice: [600, 1800],
   // One small move: how far a scroll goes down and up, and how long a pause lasts after it.
   down: [250, 700],
   up: [120, 380],
   read: [1200, 5500],
   glance: [2000, 6000],
   linger: [4000, 9000],
} as const

// No new target is begun after this much of the run; the time limit of the task is longer, so a slow target can finish.
export const BUDGET_MS = 9.5 * 60 * 1000
