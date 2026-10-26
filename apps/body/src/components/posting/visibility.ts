import type { PostVisibility } from '@automatedLinkedIn/contracts'

export const VISIBILITY_LABELS: Record<PostVisibility, string> = {
   ANYONE: 'Anyone',
   CONNECTIONS: 'Connections only',
}

// A post only your connections can see cannot be commented on by anyone else, so a post for connections takes comments from them only.
export const reachText = (audience: PostVisibility, comments: PostVisibility) => {
   if (audience === 'CONNECTIONS') {
      return 'Only your connections can see it and comment on it.'
   }

   return comments === 'CONNECTIONS'
      ? 'Anyone on LinkedIn can see it, and only your connections can comment on it.'
      : 'Anyone on LinkedIn can see it and comment on it.'
}

// What is held back, in a few words; nothing when anyone can see and comment.
export const restrictionText = (audience: PostVisibility, comments: PostVisibility) => {
   if (audience === 'CONNECTIONS' && comments === 'CONNECTIONS') {
      return 'Seen and commented on by connections only'
   }

   if (audience === 'CONNECTIONS') {
      return 'Seen by connections only'
   }

   return comments === 'CONNECTIONS' ? 'Comments from connections only' : undefined
}
