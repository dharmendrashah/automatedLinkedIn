import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

class FakeAudioContext {
   public static allow = true

   public static created = 0

   public state: 'suspended' | 'running' = 'suspended'

   public currentTime = 1

   public destination = {}

   public oscillators: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }> = []

   public constructor() {
      FakeAudioContext.created += 1
   }

   public async resume() {
      if (!FakeAudioContext.allow) {
         throw new Error('not allowed')
      }

      this.state = 'running'
   }

   public createOscillator() {
      const oscillator = {
         type: 'sine',
         frequency: {
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
         },
         connect: vi.fn(),
         start: vi.fn(),
         stop: vi.fn(),
      }

      this.oscillators.push(oscillator)

      return oscillator
   }

   public createGain() {
      return {
         gain: {
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
         },
         connect: vi.fn(),
      }
   }
}

const makeDocument = () => {
   const link = {
      href: '/favicon.svg',
      getAttribute: (name: string) => (name === 'href' ? link.href : null),
      setAttribute: (name: string, value: string) => {
         if (name === 'href') {
            link.href = value
         }
      },
   }
   // A second icon tag, as the page has (an .ico for the browsers that do not take the svg).
   const second = {
      href: '/favicon.ico',
      getAttribute: (name: string) => (name === 'href' ? second.href : null),
      setAttribute: (name: string, value: string) => {
         if (name === 'href') {
            second.href = value
         }
      },
   }
   const listeners = new Map<string, Set<() => void>>()

   return {
      link,
      second,
      listeners,
      title: 'App',
      hidden: false,
      hasFocus: () => true,
      querySelector: () => link,
      querySelectorAll: () => [link, second],
      addEventListener: vi.fn((type: string, listener: () => void) => {
         listeners.set(type, (listeners.get(type) ?? new Set()).add(listener))
      }),
      removeEventListener: vi.fn((type: string, listener: () => void) => {
         listeners.get(type)?.delete(listener)
      }),
   }
}

const storage = (initial?: string) => {
   const values = new Map<string, string>(initial ? [['takeover-alert-sound', initial]] : [])

   return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
         values.set(key, value)
      },
   }
}

const load = async () => {
   vi.resetModules()

   return import('./alert')
}

describe('takeover alert', () => {
   beforeEach(() => {
      FakeAudioContext.allow = true
      FakeAudioContext.created = 0
      vi.useFakeTimers()
      vi.stubGlobal('AudioContext', FakeAudioContext)
      vi.stubGlobal('localStorage', storage())
      vi.stubGlobal('Notification', undefined)
      vi.stubGlobal('matchMedia', () => ({ matches: false }))
   })

   afterEach(() => {
      vi.restoreAllMocks()
      vi.useRealTimers()
      vi.unstubAllGlobals()
   })

   describe('the sound', () => {
      it('should be on until the owner turns it off, and remember that', async () => {
         const first = await load()

         expect(first.getSettings().enabled).toBe(true)

         first.setEnabled(false)

         expect((await load()).getSettings().enabled).toBe(false)
      })

      it('should start blocked, and be running once a touch has unlocked it', async () => {
         const alert = await load()

         expect(alert.getSettings().sound).toBe('blocked')

         await alert.unlockSound()

         expect(alert.getSettings().sound).toBe('running')
      })

      it('should stay blocked when the browser refuses, without failing', async () => {
         FakeAudioContext.allow = false

         const alert = await load()

         await expect(alert.unlockSound()).resolves.toBeUndefined()
         expect(alert.getSettings().sound).toBe('blocked')
      })

      it('should stay blocked when there is no audio at all', async () => {
         vi.stubGlobal('AudioContext', undefined)

         const alert = await load()

         await alert.unlockSound()

         expect(alert.getSettings().sound).toBe('blocked')
      })

      it('should tell those who listen when the state changes', async () => {
         const alert = await load()
         const listener = vi.fn()
         const stop = alert.subscribe(listener)

         alert.setEnabled(false)
         stop()
         alert.setEnabled(true)

         expect(listener).toHaveBeenCalledTimes(1)
      })
   })

   describe('unlocking early', () => {
      it('should unlock on the first touch of the page and then stop listening', async () => {
         const doc = makeDocument()
         const alert = await load()

         alert.installUnlock(doc as never)

         expect([...doc.listeners.keys()].sort()).toEqual(['keydown', 'pointerdown', 'touchend'])

         for (const listener of doc.listeners.get('pointerdown') ?? []) {
            await listener()
         }

         expect(alert.getSettings().sound).toBe('running')
         expect(doc.listeners.get('keydown')?.size).toBe(0)
         expect(FakeAudioContext.created).toBe(1)
      })

      it('should keep listening while the browser still refuses', async () => {
         FakeAudioContext.allow = false

         const doc = makeDocument()
         const alert = await load()

         alert.installUnlock(doc as never)

         for (const listener of doc.listeners.get('keydown') ?? []) {
            await listener()
         }

         expect(alert.getSettings().sound).toBe('blocked')
         expect(doc.listeners.get('keydown')?.size).toBe(1)
      })

      it('should not create the audio context before a touch', async () => {
         const alert = await load()

         alert.installUnlock(makeDocument() as never)

         expect(FakeAudioContext.created).toBe(0)
      })
   })

   describe('playBoop', () => {
      it('should play nothing while the sound is blocked', async () => {
         const alert = await load()

         expect(alert.playBoop()).toBe(false)
      })

      it('should play a short tone once the sound is running', async () => {
         const alert = await load()

         await alert.unlockSound()

         expect(alert.playBoop()).toBe(true)
      })

      it('should play nothing while the owner has the sound off', async () => {
         const alert = await load()

         await alert.unlockSound()
         alert.setEnabled(false)

         expect(alert.playBoop()).toBe(false)
      })
   })

   describe('startFlicker', () => {
      it('should swap the icon and the title, and put them back', async () => {
         const doc = makeDocument()

         vi.stubGlobal('document', doc)

         const alert = await load()
         const stop = alert.startFlicker()

         expect(doc.link.href).toBe('/favicon-alert.svg')
         expect(doc.title).toBe('(!) LinkedIn needs you')

         vi.advanceTimersByTime(alert.FLICKER_MS)

         expect(doc.link.href).toBe('/favicon.svg')
         expect(doc.title).toBe('App')

         vi.advanceTimersByTime(alert.FLICKER_MS)

         expect(doc.link.href).toBe('/favicon-alert.svg')

         stop()

         expect(doc.link.href).toBe('/favicon.svg')
         expect(doc.title).toBe('App')
         expect(vi.getTimerCount()).toBe(0)
      })

      it('should swap every icon of the page and put each one back', async () => {
         const doc = makeDocument()

         vi.stubGlobal('document', doc)

         const alert = await load()
         const stop = alert.startFlicker()

         expect([doc.link.href, doc.second.href]).toEqual(['/favicon-alert.svg', '/favicon-alert.svg'])

         stop()

         expect([doc.link.href, doc.second.href]).toEqual(['/favicon.svg', '/favicon.ico'])
      })

      it('should put back the title of the page the app is on now, not the one it saw when the blinking began', async () => {
         const doc = makeDocument()

         vi.stubGlobal('document', doc)

         const alert = await load()
         const { setPageTitle } = await import('../../lib/page-title')
         const stop = alert.startFlicker()

         setPageTitle('Unibox')
         stop()

         expect(doc.title).toBe('Unibox · automatedLinkedIn')
      })

      it('should not blink when the system asks for reduced motion', async () => {
         const doc = makeDocument()

         vi.stubGlobal('document', doc)
         vi.stubGlobal('matchMedia', () => ({ matches: true }))

         const alert = await load()
         const stop = alert.startFlicker()

         vi.advanceTimersByTime(alert.FLICKER_MS * 3)

         expect(doc.link.href).toBe('/favicon-alert.svg')

         stop()

         expect(doc.link.href).toBe('/favicon.svg')
      })
   })

   describe('startAlert', () => {
      it('should boop at once and every few seconds, a few times only, and stop for good when told', async () => {
         const doc = makeDocument()

         vi.stubGlobal('document', doc)

         const alert = await load()

         await alert.unlockSound()

         const play = vi.spyOn(FakeAudioContext.prototype, 'createOscillator')
         const stop = alert.startAlert(vi.fn())

         expect(play).toHaveBeenCalledTimes(1)

         vi.advanceTimersByTime(alert.BOOP_EVERY_MS * 10)

         expect(play).toHaveBeenCalledTimes(alert.BOOP_TIMES)

         stop()

         expect(vi.getTimerCount()).toBe(0)
         expect(doc.title).toBe('App')
      })

      it('should stop the sound as soon as it is told to', async () => {
         vi.stubGlobal('document', makeDocument())

         const alert = await load()

         await alert.unlockSound()

         const play = vi.spyOn(FakeAudioContext.prototype, 'createOscillator')
         const stop = alert.startAlert(vi.fn())

         stop()
         vi.advanceTimersByTime(alert.BOOP_EVERY_MS * 3)

         expect(play).toHaveBeenCalledTimes(1)
      })

      it('should show a notification, and open the run from it, only when the tab is not in front', async () => {
         const notes: Array<{ close: ReturnType<typeof vi.fn>; onclick?: () => void }> = []
         const FakeNotification = vi.fn(function (this: object) {
            const note = { close: vi.fn() }

            notes.push(note)
            Object.assign(this, note)

            return note
         }) as unknown as typeof Notification

         Object.assign(FakeNotification, { permission: 'granted' })
         vi.stubGlobal('Notification', FakeNotification)

         const focus = vi.fn()

         vi.stubGlobal('window', { focus })

         const away = makeDocument()

         away.hidden = true
         vi.stubGlobal('document', away)

         const alert = await load()
         const open = vi.fn()
         const stop = alert.startAlert(open)

         expect(FakeNotification).toHaveBeenCalledTimes(1)

         notes[0]?.onclick?.()

         expect(focus).toHaveBeenCalled()
         expect(notes[0]?.close).toHaveBeenCalled()
         expect(open).toHaveBeenCalledTimes(1)

         stop()
         vi.stubGlobal('document', makeDocument())
         alert.startAlert(open)

         expect(FakeNotification).toHaveBeenCalledTimes(1)
      })

      it('should not show a notification the owner has not allowed', async () => {
         const FakeNotification = vi.fn() as unknown as typeof Notification

         Object.assign(FakeNotification, { permission: 'default' })
         vi.stubGlobal('Notification', FakeNotification)

         const away = makeDocument()

         away.hidden = true
         vi.stubGlobal('document', away)

         const alert = await load()

         alert.startAlert(vi.fn())

         expect(FakeNotification).not.toHaveBeenCalled()
      })
   })
})
