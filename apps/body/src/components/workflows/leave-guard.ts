// Leaving the canvas with changes that are not saved (.plan/workflow-hardening-and-block-details.md). The app's router has
// no way to block a move, so the canvas watches clicks on links while it has unsaved changes.

type Click = {
   href: string
   target: string
   button: number
   metaKey: boolean
   ctrlKey: boolean
   shiftKey: boolean
   altKey: boolean
}

// Where a click would take the owner inside the app, or null when it does not leave this page.
export const leaveTarget = (click: Click, here: { origin: string; pathname: string }) => {
   if (
      click.button !== 0 ||
      click.target === '_blank' ||
      click.metaKey ||
      click.ctrlKey ||
      click.shiftKey ||
      click.altKey
   ) {
      return null
   }

   try {
      const url = new URL(click.href)

      if (url.origin !== here.origin || url.pathname === here.pathname) {
         return null
      }

      return `${url.pathname}${url.search}${url.hash}`
   } catch {
      return null
   }
}

// A save refused because someone else saved the workflow first (the sentence brain answers with).
export const isChangedElsewhere = (message: string | undefined) => Boolean(message?.includes('changed somewhere else'))
