import { type PersonRow } from './types'

// What the hover actions of a My network row may do (.plan/network-person-drawer.md). Links only: the Unibox does the writing.

export type ActionRow = Pick<PersonRow, 'slug' | 'doNotContact' | 'connectedAt' | 'inviteState' | 'links'>

export type MessageAction = { kind: 'OPEN_CHAT' | 'START_CHAT'; href: string } | { kind: 'NONE'; reason: string }

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

const chatsLink = (row: ActionRow) => {
   const chat = newest(row.links, 'CONVERSATION')

   return chat ? `/unibox/${encodeURIComponent(chat.sourceId)}` : null
}

// A conversation opens (even on Do not contact: reading is allowed); a connection starts one from its account; anyone else needs
// an invite first (LinkedIn allows only InMail to them).
export const messageAction = (row: ActionRow): MessageAction => {
   const chat = chatsLink(row)

   if (chat) {
      return {
         kind: 'OPEN_CHAT',
         href: chat,
      }
   }

   if (row.doNotContact) {
      return {
         kind: 'NONE',
         reason: 'On Do not contact',
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

   return {
      kind: 'NONE',
      reason: 'Not connected yet',
   }
}

// Why no invite can go to the person, or null when one can.
export const inviteBlock = (row: ActionRow, invitesLive: boolean) => {
   if (row.doNotContact) {
      return 'On Do not contact'
   }

   if (row.connectedAt) {
      return 'Already connected'
   }

   return INVITE_HELD[row.inviteState] ?? (invitesLive ? null : 'Invites are not on yet')
}
