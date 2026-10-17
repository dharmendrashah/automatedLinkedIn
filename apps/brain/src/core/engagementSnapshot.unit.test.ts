import { describe, expect, it } from 'vitest'

import {
   commentsSnapshotFrom,
   reactionsSnapshotFrom,
   readCommentsSnapshot,
   readReactionsSnapshot,
} from './engagementSnapshot'

describe('commentsSnapshotFrom', () => {
   it('should keep each comment with its person, marking the author and companies', () => {
      const snapshot = commentsSnapshotFrom(
         [
            {
               commenterName: 'Ada Lovelace',
               commenterHeadline: 'Engineer',
               commenterUrl: 'https://www.linkedin.com/in/Ada-L?trk=x',
               commenterPhoto: 'https://media.example/ada.jpg',
               commenterProfileId: 'internal',
               commenterFollowers: 120,
               comment: '  Great post  ',
               commentedAt: '2026-10-01',
               commentReactions: [
                  {
                     type: 'LIKE',
                     count: 3,
                  },
                  {
                     type: 'PRAISE',
                     count: 2,
                  },
               ],
            },
            {
               commenterName: 'Stripe',
               commenterUrl: 'https://www.linkedin.com/company/stripe',
               commenterType: 'company',
               commenterPhoto: 'http://insecure.example/logo.png',
               comment: 'Thanks',
            },
            {
               commenterName: 'The author',
               commenterUrl: 'https://www.linkedin.com/in/author',
               isAuthor: true,
               comment: 'Reply',
            },
            'not a row',
         ],
         100
      )

      expect(snapshot).toEqual({
         limit: 100,
         items: [
            {
               slug: 'ada-l',
               url: 'https://www.linkedin.com/in/ada-l',
               name: 'Ada Lovelace',
               headline: 'Engineer',
               photo: 'https://media.example/ada.jpg',
               followers: 120,
               isAuthor: false,
               isCompany: false,
               text: 'Great post',
               at: '2026-10-01',
               reactions: 5,
            },
            {
               slug: null,
               url: 'https://www.linkedin.com/company/stripe',
               name: 'Stripe',
               headline: null,
               photo: null,
               followers: null,
               isAuthor: false,
               isCompany: true,
               text: 'Thanks',
               at: null,
               reactions: 0,
            },
            {
               slug: 'author',
               url: 'https://www.linkedin.com/in/author',
               name: 'The author',
               headline: null,
               photo: null,
               followers: null,
               isAuthor: true,
               isCompany: false,
               text: 'Reply',
               at: null,
               reactions: 0,
            },
         ],
      })
      expect(readCommentsSnapshot(snapshot)).toEqual(snapshot)
      expect(readCommentsSnapshot({ items: 'no' })).toBeNull()
   })
})

describe('reactionsSnapshotFrom', () => {
   it('should keep each reaction with its person and type', () => {
      const snapshot = reactionsSnapshotFrom(
         [
            {
               reactorName: 'Ada Lovelace',
               reactorUrl: 'https://www.linkedin.com/in/ada-l',
               reactorHeadline: 'Engineer',
               reactorLocation: 'London',
               reactorPhoto: 'https://media.example/ada.jpg',
               reactionType: 'PRAISE',
               reactorProfileId: 'internal',
            },
            { reactorName: 'No link' },
         ],
         1_000
      )

      expect(snapshot).toEqual({
         limit: 1_000,
         items: [
            {
               slug: 'ada-l',
               url: 'https://www.linkedin.com/in/ada-l',
               name: 'Ada Lovelace',
               headline: 'Engineer',
               photo: 'https://media.example/ada.jpg',
               location: 'London',
               type: 'PRAISE',
            },
         ],
      })
      expect(readReactionsSnapshot(snapshot)).toEqual(snapshot)
   })
})
