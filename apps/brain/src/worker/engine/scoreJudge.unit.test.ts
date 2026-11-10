import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type JudgeRun, judgeKept } from './scoreJudge'
import { person } from 'core/workflowItem'

import { type ScoringRules, type Thresholds } from './steps'

// core's index loads services that read env; these pure judgements need none of it.
vi.mock('env', () => ({}))

const mocks = vi.hoisted(() => ({
   configured: vi.fn(() => true),
   callModel: vi.fn(),
   room: vi.fn(async () => 'OK'),
   previewRoom: vi.fn(async () => true),
   record: vi.fn(async () => undefined),
   recent: vi.fn(async () => new Map<string, number>()),
   save: vi.fn(async () => undefined),
}))

vi.mock('core/aiModel', () => ({
   aiConfigured: mocks.configured,
   callModel: mocks.callModel,
   aiPrice: () => ({
      inputMicros: 1_000_000,
      outputMicros: 2_000_000,
   }),
}))

vi.mock('database', () => ({
   AiBudgetService: {
      room: mocks.room,
      previewRoom: mocks.previewRoom,
      record: mocks.record,
   },
   IcpJudgementService: {
      recent: mocks.recent,
      save: mocks.save,
   },
   floorMicros: () => 0,
}))

const RULES: ScoringRules = {
   includeTitles: ['head of growth'],
   excludeTitles: [],
   seniorities: [],
   locations: [],
   industries: [],
   companySizes: [],
   problemKeywords: ['onboarding too slow'],
}
const THRESHOLDS: Thresholds = {
   qualifyScore: 60,
   maybeScore: 40,
   maybeEnabled: true,
}
const RUN: JudgeRun = {
   userId: 'user-1',
   workflowId: 'workflow-1',
   runId: 'run-1',
   preview: false,
   icpId: 'icp-1',
   balanceMicros: async () => 50_000_000,
}

const kept = (slug: string, score: number) =>
   person({
      slug,
      url: `https://www.linkedin.com/in/${slug}`,
      headline: 'Head of Growth',
      score,
      band: 'MAYBE',
      signals: [
         {
            type: 'commented',
            via: 'post',
            at: '2026-11-09T10:00:00Z',
            excerpt: 'onboarding too slow',
         },
      ],
   })

const answered = (fit: number) => ({
   output: { fit },
   model: 'test-model',
   inputTokens: 100,
   outputTokens: 10,
})

beforeEach(() => {
   vi.clearAllMocks()
   mocks.configured.mockReturnValue(true)
   mocks.room.mockResolvedValue('OK')
   mocks.previewRoom.mockResolvedValue(true)
   mocks.recent.mockResolvedValue(new Map())
   mocks.callModel.mockResolvedValue(answered(90))
})

describe('the AI judgement of kept people', () => {
   it('should blend the fit into the score, re-band it, and keep the judgement and the cost', async () => {
      const { kept: out, note } = await judgeKept(RUN, [kept('ada', 60)], RULES, THRESHOLDS, 30)

      expect(out.map(({ slug, score, band }) => [slug, score, band])).toEqual([['ada', 69, 'QUALIFIED']])
      expect(mocks.save).toHaveBeenCalledWith('user-1', 'icp-1', 'ada', 90)
      expect(mocks.record).toHaveBeenCalledWith(
         'user-1',
         expect.objectContaining({
            label: 'AI judgement',
            amountMicros: expect.any(Number),
            preview: false,
         })
      )
      expect(note).toBe('AI judgement: 1 judged, 0 reused, 0 kept the rule score.')
   })

   it('should reuse a judgement kept within 30 days instead of paying again', async () => {
      mocks.recent.mockResolvedValue(new Map([['ada', 90]]))

      const { kept: out, note } = await judgeKept(RUN, [kept('ada', 60)], RULES, THRESHOLDS, 30)

      expect(mocks.callModel).not.toHaveBeenCalled()
      expect(out[0]?.score).toBe(69)
      expect(note).toBe('AI judgement: 0 judged, 1 reused, 0 kept the rule score.')
   })

   it('should let the blend drop a kept person whose score falls below maybe', async () => {
      mocks.callModel.mockResolvedValue(answered(0))

      const { kept: out } = await judgeKept(RUN, [kept('ada', 45)], RULES, THRESHOLDS, 100)

      expect(out).toEqual([])
   })

   it('should keep the rule score and make no call when AI is not set up', async () => {
      mocks.configured.mockReturnValue(false)

      const { kept: out, note } = await judgeKept(RUN, [kept('ada', 60)], RULES, THRESHOLDS, 30)

      expect(mocks.callModel).not.toHaveBeenCalled()
      expect(out[0]?.score).toBe(60)
      expect(note).toBe('AI judgement: 0 judged, 0 reused, 1 kept the rule score. AI is not set up.')
   })

   it('should keep the rule score when the provider fails, and never fail the step', async () => {
      mocks.callModel.mockRejectedValue(new Error('provider down'))

      const { kept: out } = await judgeKept(RUN, [kept('ada', 60)], RULES, THRESHOLDS, 30)

      expect(out[0]?.score).toBe(60)
      expect(mocks.save).not.toHaveBeenCalled()
      expect(mocks.record).not.toHaveBeenCalled()
   })

   it('should make no call once the AI budget refuses, and keep the rule score for the rest', async () => {
      mocks.room.mockResolvedValue('LIMIT')

      const { kept: out, note } = await judgeKept(RUN, [kept('ada', 60), kept('bo', 50)], RULES, THRESHOLDS, 30)

      expect(mocks.callModel).not.toHaveBeenCalled()
      expect(out.map(({ score }) => score)).toEqual([60, 50])
      expect(note).toContain('AI limit reached.')
   })

   it('should make no call in a preview beyond its allowance', async () => {
      mocks.previewRoom.mockResolvedValue(false)

      const { kept: out } = await judgeKept(
         {
            ...RUN,
            preview: true,
         },
         [kept('ada', 60)],
         RULES,
         THRESHOLDS,
         30
      )

      expect(mocks.callModel).not.toHaveBeenCalled()
      expect(out[0]?.score).toBe(60)
   })
})
