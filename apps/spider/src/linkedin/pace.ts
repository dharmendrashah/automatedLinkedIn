import { type Pace } from '../browsing/reader'

// How a person moves on a LinkedIn page, in milliseconds: how far one scroll goes down and up, and how long a pause lasts after it.
export const PACE: Pace = {
   down: [250, 700],
   up: [120, 380],
   read: [1200, 5500],
   glance: [2000, 6000],
   linger: [4000, 9000],
}
