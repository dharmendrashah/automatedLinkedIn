import { SENIORITIES } from 'core'

import { type OutreachAnswers, buildOutreach, outreachAnswersSchema } from '@automatedLinkedIn/contracts'

import { CampaignService } from './campaign.service'
import { ConflictError } from './conflict'
import { IcpService } from './icp.service'
import { PrismaService } from './prisma.service'
import { WorkflowService } from './workflow.service'

// The Starter (.plan/lead-pipeline-p6-campaign-starter.md): turns the answers of one form into an ideal customer, a campaign and six
// workflows, all switched off with "Act for real" off. A failure part way removes what was made, so a retry starts clean; the campaign
// name is the idempotency (a second click is refused with a sentence, never a second campaign).

const isSeniority = (value: string) => SENIORITIES.some(level => level === value.toUpperCase())

type Stage = ReturnType<typeof buildOutreach>['workflows'][number]

export class CampaignStarterService {
   public static async createOutreach(userId: string, input: OutreachAnswers) {
      const answers = outreachAnswersSchema.parse(input)
      const db = PrismaService.client
      const made = {
         icp: null as string | null,
         campaign: null as string | null,
         workflows: [] as string[],
      }

      try {
         const campaignDraft = buildOutreach(answers, 'pending').campaign
         const taken = await db.campaign.findFirst({
            where: {
               userId,
               OR: [{ name: campaignDraft.name }, { label: campaignDraft.label }],
            },
            select: { id: true },
         })

         if (taken) {
            throw new ConflictError(
               `You already have a campaign named "${campaignDraft.name}" or one that gives the same label.`
            )
         }

         const { customer } = answers
         let { icpId } = customer

         if (icpId !== '') {
            if (!(await IcpService.getForUser(userId, icpId))) {
               throw new ConflictError('That ideal customer was not found.')
            }
         } else {
            const created = await IcpService.create(userId, {
               name: answers.name,
               includeTitles: customer.includeTitles.map(title => title.toLowerCase()),
               excludeTitles: [],
               seniorities: customer.seniorities.map(level => level.toUpperCase()).filter(isSeniority),
               industries: customer.industries.map(each => each.toLowerCase()),
               companySizes: customer.companySizes,
               locations: customer.locations.map(each => each.toLowerCase()),
               problemKeywords: answers.phrases.map(each => each.toLowerCase()),
            })

            icpId = created.id
            made.icp = created.id
         }

         const recipe = buildOutreach(answers, icpId)
         const campaign = await CampaignService.create(userId, { name: recipe.campaign.name })

         made.campaign = campaign.id
         await db.campaign.update({
            where: { id: campaign.id },
            data: { icpId },
         })

         const workflows: Array<{ id: string; stage: string; name: string }> = []
         const place = async ({ stage, name, graph }: Stage) => {
            const workflow = await WorkflowService.create(userId, {
               name,
               goal: null,
               graph,
            })

            made.workflows.push(workflow.id)
            await CampaignService.place(userId, workflow.id, campaign.id, stage)
            workflows.push({
               id: workflow.id,
               stage,
               name,
            })

            return workflow
         }

         // Discover is made first: Invite starts when it finishes, so its id is needed before the other stages are built.
         const [discover] = recipe.workflows

         if (!discover) {
            throw new ConflictError('The outreach recipe has no Discover stage.')
         }

         const discoverWorkflow = await place(discover)

         for (const stage of buildOutreach(answers, icpId, discoverWorkflow.id).workflows.slice(1)) {
            await place(stage)
         }

         return {
            campaignId: campaign.id,
            workflows,
         }
      } catch (error) {
         for (const id of made.workflows) {
            await WorkflowService.delete(userId, id).catch(() => undefined)
         }

         if (made.campaign) {
            await CampaignService.remove(userId, made.campaign).catch(() => undefined)
         }

         if (made.icp) {
            await IcpService.delete(userId, made.icp).catch(() => undefined)
         }

         throw error
      }
   }
}
