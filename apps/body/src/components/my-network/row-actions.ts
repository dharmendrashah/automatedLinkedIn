import { type PersonRow } from './types'

// What the hover actions of a My network row may do (.plan/network-person-drawer.md). Links only: the Unibox does the writing.

export type ActionRow = Pick<
   PersonRow,
   'slug' | 'company' | 'companySlug' | 'profileRead' | 'doNotContact' | 'connectedAt' | 'inviteState' | 'links'
>

export type MessageAction =
   { kind: 'OPEN_CHAT' | 'START_CHAT'; href: string } | { kind: 'INVITE' } | { kind: 'NONE'; reason: string }

type Link = ActionRow['links'][number]

const newest = (links: Link[], kind: Link['kind']) =>
   links
      .filter(link => link.kind === kind && link.accountId)
      .reduce<Link | undefined>(
         (best, link) => (!best || new Date(link.at) > new Date(best.at) ? link : best),
         undefined
      )

const INVITE_HELD: Partial<Record<ActionRow['inviteState'], string>> = {
   QUEUED: 'Invite already queued',
   PENDING: 'Invite already sent',
   ACCEPTED: 'Invite already accepted',
}

export const chatsLink = (row: ActionRow) => {
   const chat = newest(row.links, 'CONVERSATION')

   return chat ? `/unibox/${encodeURIComponent(chat.sourceId)}` : null
}

// A conversation opens; a connection starts one from its account; anyone else is invited (LinkedIn allows only InMail to them).
export const messageAction = (row: ActionRow, invitesLive: boolean): MessageAction => {
   if (row.doNotContact) {
      return {
         kind: 'NONE',
         reason: 'On Do not contact',
      }
   }

   const chat = chatsLink(row)

   if (chat) {
      return {
         kind: 'OPEN_CHAT',
         href: chat,
      }
   }

   if (row.connectedAt) {
      const account = newest(row.links, 'CONNECTION')?.accountId

      return account
         ? {
              kind: 'START_CHAT',
              href: `/unibox/new?${new URLSearchParams({
                 account,
                 to: row.slug,
              }).toString()}`,
           }
         : {
              kind: 'NONE',
              reason: 'No account to write from',
           }
   }

   const held = INVITE_HELD[row.inviteState]

   if (held) {
      return {
         kind: 'NONE',
         reason: held,
      }
   }

   return invitesLive
      ? { kind: 'INVITE' }
      : {
           kind: 'NONE',
           reason: 'Invites are not on yet',
        }
}

// Read company needs the company's LinkedIn link, which a profile read brings and saves to /companies; null when it can run.
export const readCompanyReason = (row: ActionRow) =>
   row.companySlug ? null : row.profileRead ? 'No LinkedIn company on the profile' : 'Read the profile first'
