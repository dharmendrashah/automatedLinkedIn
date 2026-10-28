import { type InspectedBlock } from '../scraping/driver'

// The feed as LinkedIn marks it from 2026-10-27 (no data-view-name, no reaction bar): the twelve posts of a real feed, recorded on
// 2026-10-28 from a failed visit. Only the structure the readers rely on is here: the member (`m`) and company (`c`) links, and the
// links back to the feed (`f`, the big image), each with its size, and whether the block carries the ad label. No names, text,
// addresses or ids: the keys of a post are left out, and the id rules are tested on the older layout.
type Kind = 'm' | 'c' | 'f'

const CURRENT_POSTS: { promoted: boolean; links: [Kind, number, number][] }[] = [
   {
      promoted: false,
      links: [
         ['m', 1184, 156],
         ['m', 1264, 191],
         ['f', 1264, 327],
         ['f', 1264, 38],
         ['f', 1264, 191],
      ],
   },
   {
      promoted: true,
      links: [
         ['m', 1184, 156],
         ['m', 1264, 191],
         ['c', 59, 16],
         ['c', 1184, 156],
         ['c', 1264, 191],
         ['m', 101, 16],
         ['f', 1264, 327],
         ['f', 1264, 38],
         ['f', 1264, 346],
      ],
   },
   {
      promoted: false,
      links: [
         ['m', 1184, 156],
         ['m', 1264, 191],
         ['f', 1184, 367],
         ['f', 1264, 327],
         ['f', 1264, 38],
      ],
   },
   {
      promoted: false,
      links: [
         ['m', 1184, 156],
         ['m', 109, 16],
         ['m', 1184, 156],
         ['m', 1264, 191],
         ['f', 1264, 327],
         ['f', 1264, 38],
         ['f', 1264, 502],
      ],
   },
   {
      promoted: false,
      links: [
         ['m', 1264, 760],
         ['m', 1264, 760],
         ['m', 1264, 589],
      ],
   },
   {
      promoted: false,
      links: [
         ['m', 114, 16],
         ['m', 100, 16],
         ['f', 1184, 1184],
         ['f', 1264, 54],
         ['f', 353, 16],
         ['f', 1264, 327],
         ['f', 1264, 38],
         ['f', 1264, 502],
      ],
   },
   {
      promoted: false,
      links: [
         ['m', 1184, 156],
         ['m', 112, 16],
         ['m', 1184, 156],
         ['m', 1264, 191],
         ['f', 1264, 327],
         ['f', 1264, 38],
         ['f', 1264, 346],
      ],
   },
   {
      promoted: false,
      links: [
         ['m', 1184, 156],
         ['m', 1264, 191],
         ['c', 149, 16],
         ['f', 1264, 327],
         ['f', 1264, 38],
         ['f', 1264, 502],
      ],
   },
   {
      promoted: false,
      links: [
         ['m', 1184, 156],
         ['m', 112, 16],
         ['f', 1184, 1184],
         ['f', 1264, 54],
         ['f', 353, 16],
         ['f', 1264, 327],
         ['f', 1264, 38],
         ['f', 1264, 502],
      ],
   },
   {
      promoted: false,
      links: [
         ['m', 1184, 156],
         ['m', 118, 16],
         ['m', 1184, 156],
         ['m', 1264, 54],
         ['f', 1184, 877],
         ['f', 1264, 327],
         ['f', 1264, 38],
         ['f', 1264, 346],
         ['m', 1184, 156],
         ['m', 1264, 54],
      ],
   },
   {
      promoted: false,
      links: [
         ['m', 1184, 156],
         ['m', 1264, 191],
         ['c', 64, 16],
         ['m', 90, 16],
         ['m', 127, 16],
         ['f', 1184, 1480],
         ['f', 1264, 327],
         ['f', 1264, 38],
         ['f', 1264, 502],
      ],
   },
   {
      promoted: false,
      links: [
         ['m', 1184, 156],
         ['m', 130, 16],
         ['m', 1184, 156],
         ['m', 1264, 191],
         ['f', 1264, 327],
         ['f', 1264, 38],
         ['f', 1264, 502],
      ],
   },
]

const BASE = 'https://www.linkedin.com'

const HREF: Record<Kind, string> = {
   m: `${BASE}/in/sample-member/`,
   c: `${BASE}/company/sample-company/`,
   f: `${BASE}/feed/`,
}

// The twelve blocks of the feed as the inspection reports them: no keys, no marks, the ad label where the page has it.
export const currentFeedBlocks = (): InspectedBlock[] =>
   CURRENT_POSTS.map(({ promoted, links }) => ({
      keys: [],
      marks: [],
      promoted,
      links: links.map(([kind, width, height], index) => ({
         tag: 'a',
         href: HREF[kind],
         text: '',
         label: '',
         role: '',
         view: '',
         box: {
            x: 0,
            y: index * 10,
            width,
            height,
         },
         inView: false,
         covered: false,
         path: [],
      })),
   }))
