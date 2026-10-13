import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ProxyScoringJob } from './proxyScoringJob'

const mocks = vi.hoisted(() => ({
   findDue: vi.fn(),
   claim: vi.fn(),
   score: vi.fn(),
   retest: vi.fn(),
}))

vi.mock('./proxyScoring.service', () => ({
   ProxyScoringService: {
      findDue: mocks.findDue,
      claim: mocks.claim,
      score: mocks.score,
   },
}))

vi.mock('./proxyServer.service', () => ({ ProxyServerService: { retest: mocks.retest } }))

const NOW = new Date('2026-10-14T10:00:00Z')

const due = (id: string, extra: Record<string, unknown> = {}) => ({
   id,
   status: 'ACTIVE',
   scoredAt: null,
   retest: true,
   ...extra,
})

const ok = {
   stop: false,
   remaining: 900,
}

describe('ProxyScoringJob', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      vi.spyOn(console, 'log').mockImplementation(() => undefined)
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      mocks.claim.mockResolvedValue(true)
      mocks.score.mockResolvedValue(ok)
      mocks.retest.mockResolvedValue({ status: 'ACTIVE' })
   })

   afterEach(() => {
      ProxyScoringJob.stop()
      ProxyScoringJob.reset()
      vi.useRealTimers()
   })

   describe('runDue', () => {
      it('should re-test and then score every due proxy it can claim', async () => {
         mocks.findDue.mockResolvedValue([due('a'), due('b')])

         await expect(ProxyScoringJob.runDue(NOW, { retryDelayMs: 0 })).resolves.toEqual({
            scored: 2,
            failed: 0,
         })

         expect(mocks.retest.mock.calls).toEqual([['a'], ['b']])
         expect(mocks.score.mock.calls).toEqual([['a'], ['b']])
         expect(mocks.findDue).toHaveBeenCalledWith(NOW, 200)
      })

      it('should skip a proxy another run already took', async () => {
         mocks.findDue.mockResolvedValue([due('a'), due('b')])
         mocks.claim.mockResolvedValueOnce(false)

         await ProxyScoringJob.runDue(NOW, { retryDelayMs: 0 })

         expect(mocks.score.mock.calls).toEqual([['b']])
      })

      it('should only repeat the lookup, not the test, for a proxy whose lookup failed earlier today', async () => {
         mocks.findDue.mockResolvedValue([due('a', { retest: false })])

         await ProxyScoringJob.runDue(NOW, { retryDelayMs: 0 })

         expect(mocks.retest).not.toHaveBeenCalled()
         expect(mocks.score).toHaveBeenCalledWith('a')
      })

      it('should re-test once more before accepting that a working proxy is down', async () => {
         mocks.findDue.mockResolvedValue([due('a')])
         mocks.retest.mockResolvedValueOnce({ status: 'UNREACHABLE' }).mockResolvedValueOnce({ status: 'ACTIVE' })

         await ProxyScoringJob.runDue(NOW, { retryDelayMs: 0 })

         expect(mocks.retest).toHaveBeenCalledTimes(2)
      })

      it('should not retry a proxy that was already unreachable', async () => {
         mocks.findDue.mockResolvedValue([due('a', { status: 'UNREACHABLE' })])
         mocks.retest.mockResolvedValue({ status: 'UNREACHABLE' })

         await ProxyScoringJob.runDue(NOW, { retryDelayMs: 0 })

         expect(mocks.retest).toHaveBeenCalledTimes(1)
         expect(mocks.score).toHaveBeenCalledWith('a')
      })

      it('should stop the run when AbuseIPDB says to, and stay quiet until it allows again', async () => {
         mocks.findDue.mockResolvedValue([due('a'), due('b')])
         mocks.score.mockResolvedValueOnce({
            stop: true,
            retryAfterSeconds: 7200,
            remaining: null,
         })

         await ProxyScoringJob.runDue(NOW, { retryDelayMs: 0 })

         expect(mocks.score).toHaveBeenCalledTimes(1)

         mocks.findDue.mockClear()

         await ProxyScoringJob.runDue(new Date(NOW.getTime() + 3600_000), { retryDelayMs: 0 })
         expect(mocks.findDue).not.toHaveBeenCalled()

         await ProxyScoringJob.runDue(new Date(NOW.getTime() + 7300_000), { retryDelayMs: 0 })
         expect(mocks.findDue).toHaveBeenCalled()
      })

      it('should stop the run when no checks are left today', async () => {
         mocks.findDue.mockResolvedValue([due('a'), due('b')])
         mocks.score.mockResolvedValueOnce({
            stop: false,
            remaining: 0,
         })

         await ProxyScoringJob.runDue(NOW, { retryDelayMs: 0 })

         expect(mocks.score).toHaveBeenCalledTimes(1)
      })

      it('should keep going when one proxy fails, and count it', async () => {
         mocks.findDue.mockResolvedValue([due('a'), due('b')])
         mocks.retest.mockRejectedValueOnce(new Error('database down'))

         await expect(ProxyScoringJob.runDue(NOW, { retryDelayMs: 0 })).resolves.toEqual({
            scored: 1,
            failed: 1,
         })
         expect(mocks.score).toHaveBeenCalledWith('b')
      })

      it('should not overlap with a run that is still going', async () => {
         let release: () => void = () => undefined

         mocks.findDue.mockReturnValue(
            new Promise(resolve => {
               release = () => resolve([])
            })
         )

         const first = ProxyScoringJob.runDue(NOW, { retryDelayMs: 0 })
         const second = await ProxyScoringJob.runDue(NOW, { retryDelayMs: 0 })

         expect(second).toEqual({
            scored: 0,
            failed: 0,
         })
         expect(mocks.findDue).toHaveBeenCalledTimes(1)

         release()
         await first
      })

      it('should log nothing when nothing was due, so an idle brain stays idle', async () => {
         mocks.findDue.mockResolvedValue([])

         await ProxyScoringJob.runDue(NOW, { retryDelayMs: 0 })

         expect(console.log).not.toHaveBeenCalled()
         expect(console.error).not.toHaveBeenCalled()
      })

      it('should log one line when proxies were scored', async () => {
         mocks.findDue.mockResolvedValue([due('a')])

         await ProxyScoringJob.runDue(NOW, { retryDelayMs: 0 })

         expect(console.log).toHaveBeenCalledTimes(1)
      })
   })

   describe('start and stop', () => {
      it('should run a minute after boot and then every hour, until stopped', async () => {
         vi.useFakeTimers()

         const run = vi.spyOn(ProxyScoringJob, 'runDue').mockResolvedValue({
            scored: 0,
            failed: 0,
         })

         ProxyScoringJob.start()
         expect(run).not.toHaveBeenCalled()

         await vi.advanceTimersByTimeAsync(60_000)
         expect(run).toHaveBeenCalledTimes(1)

         await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
         expect(run).toHaveBeenCalledTimes(2)

         ProxyScoringJob.stop()
         await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000)
         expect(run).toHaveBeenCalledTimes(2)
      })

      it('should not start twice', async () => {
         vi.useFakeTimers()

         const run = vi.spyOn(ProxyScoringJob, 'runDue').mockResolvedValue({
            scored: 0,
            failed: 0,
         })

         ProxyScoringJob.start()
         ProxyScoringJob.start()
         await vi.advanceTimersByTimeAsync(60_000)

         expect(run).toHaveBeenCalledTimes(1)
      })
   })
})
