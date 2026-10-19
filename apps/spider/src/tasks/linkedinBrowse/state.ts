import { type FeedPost } from '../../linkedin/feedReader'

// A post address that does not open a post, or a feed that shows no post with one, twice means this feed cannot be walked that
// way; the rest goes by profiles.
const MAX_POST_FAILURES = 2

// What one walk has done so far, so it does not go to the same post or author twice and knows when to change its way.
export class WalkState {
   public readonly used = new Set<string>()
   public readonly usedAuthors = new Set<string>()
   public postFailures = 0
   public addressMisses = 0
   // The account's own profile, as the feed showed it: a post page does not show which link is the account's.
   public own: string | undefined

   public get profilesOnly() {
      return this.postFailures >= MAX_POST_FAILURES || this.addressMisses >= MAX_POST_FAILURES
   }

   public take({ key, authorHref }: FeedPost) {
      this.used.add(key)

      if (authorHref) {
         this.usedAuthors.add(authorHref)
      }
   }
}
