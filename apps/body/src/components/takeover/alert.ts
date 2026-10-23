import { getPageTitle } from '../../lib/page-title'

const ALERT_ICON = '/favicon-alert.svg'
const ALERT_TITLE = '(!) LinkedIn needs you'
const SOUND_KEY = 'takeover-alert-sound'

export const FLICKER_MS = 700
export const BOOP_EVERY_MS = 10_000
export const BOOP_TIMES = 5

export type AlertSettings = {
   // The owner's choice, kept in the browser.
   enabled: boolean
   // A browser only plays sound on a page the person has touched, so this is about the browser, not the owner.
   sound: 'running' | 'blocked'
   notifications: NotificationPermission | 'unsupported'
}

const readEnabled = () => {
   try {
      return localStorage.getItem(SOUND_KEY) !== 'off'
   } catch {
      return true
   }
}

let settings: AlertSettings = {
   enabled: readEnabled(),
   sound: 'blocked',
   notifications: typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
}
let context: AudioContext | undefined

const listeners = new Set<() => void>()

const change = (patch: Partial<AlertSettings>) => {
   settings = {
      ...settings,
      ...patch,
   }

   for (const listener of listeners) {
      listener()
   }
}

export const getSettings = () => settings

export const subscribe = (listener: () => void) => {
   listeners.add(listener)

   return () => {
      listeners.delete(listener)
   }
}

export const setEnabled = (enabled: boolean) => {
   try {
      localStorage.setItem(SOUND_KEY, enabled ? 'on' : 'off')
   } catch {
      // The choice then lasts until the page is closed.
   }

   change({ enabled })
}

// Creates the audio context and starts it, which a browser only lets a click, a key or a touch do.
export const unlockSound = async () => {
   try {
      context ??= new AudioContext()

      if (context.state !== 'running') {
         await context.resume()
      }
   } catch {
      // No audio, or still not allowed: the sound stays blocked and the other alerts still work.
   }

   change({ sound: context?.state === 'running' ? 'running' : 'blocked' })
}

const TOUCHES = ['pointerdown', 'keydown', 'touchend'] as const

// Waits for the first touch of the page, from the moment the app starts, so the sound is unlocked long before an alert needs
// it. It keeps waiting while the browser still refuses (a key such as Escape does not count as a touch).
export const installUnlock = (target: Pick<Document, 'addEventListener' | 'removeEventListener'> = document) => {
   const remove = () => {
      for (const touch of TOUCHES) {
         target.removeEventListener(touch, unlock, true)
      }
   }

   const unlock = async () => {
      await unlockSound()

      if (settings.sound === 'running') {
         remove()
      }
   }

   for (const touch of TOUCHES) {
      target.addEventListener(touch, unlock, true)
   }

   return remove
}

// A short falling "boop". Nothing plays while the sound is off or blocked.
export const playBoop = () => {
   if (!settings.enabled || !context || context.state !== 'running') {
      return false
   }

   const at = context.currentTime
   const tone = context.createOscillator()
   const gain = context.createGain()

   tone.type = 'sine'
   tone.frequency.setValueAtTime(660, at)
   tone.frequency.exponentialRampToValueAtTime(440, at + 0.18)
   gain.gain.setValueAtTime(0.0001, at)
   gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02)
   gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22)
   tone.connect(gain)
   gain.connect(context.destination)
   tone.start(at)
   tone.stop(at + 0.25)

   return true
}

// Swaps the icons of the tab and the title while a run waits, and puts both back: the icons as they were, the title as the app has it
// then (the page may have changed meanwhile). With reduced motion asked for, they are changed once and do not blink.
export const startFlicker = () => {
   const links = [...document.querySelectorAll('link[rel~="icon"]')]
   const icons = links.map(link => link.getAttribute('href'))
   const title = document.title
   const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

   const show = (on: boolean) => {
      links.forEach((link, index) => {
         const icon = icons[index]

         if (icon !== null && icon !== undefined) {
            link.setAttribute('href', on ? ALERT_ICON : icon)
         }
      })

      document.title = on ? ALERT_TITLE : (getPageTitle() ?? title)
   }

   let on = true

   show(true)

   const timer = calm
      ? undefined
      : setInterval(() => {
           on = !on
           show(on)
        }, FLICKER_MS)

   return () => {
      clearInterval(timer)
      show(false)
   }
}

export const askForNotifications = async () => {
   if (typeof Notification === 'undefined') {
      return
   }

   change({ notifications: await Notification.requestPermission() })
}

// The system plays its own sound for this and shows it with the tab hidden, whatever the browser thinks of the page.
export const notifyTakeover = (onOpen: () => void) => {
   if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      return undefined
   }

   const note = new Notification('LinkedIn needs you', {
      body: 'A sign-in stopped at a security check. Open the app to finish it.',
      tag: 'takeover',
      requireInteraction: true,
      silent: false,
   })

   note.onclick = () => {
      window.focus()
      note.close()
      onOpen()
   }

   return () => note.close()
}

const isAway = () => document.hidden || !document.hasFocus()

// Everything that tells the owner a run waits: the icon and title, the boop at once and again every few seconds (a few
// times only), and a notification when the tab is not in front. It stops all of it with the function it returns.
export const startAlert = (onOpen: () => void) => {
   const stopFlicker = startFlicker()
   const closeNote = isAway() ? notifyTakeover(onOpen) : undefined
   let plays = 0

   const boop = () => {
      plays += 1
      playBoop()

      if (plays >= BOOP_TIMES) {
         clearInterval(timer)
      }
   }

   const timer = setInterval(boop, BOOP_EVERY_MS)

   boop()

   return () => {
      clearInterval(timer)
      stopFlicker()
      closeNote?.()
   }
}
