import { unique } from '../registry'
import { accountDaily } from './accountDaily'
import { approvalStart } from './approvalStart'
import { campaignRollup } from './campaignRollup'
import { connectionImport } from './connectionImport'
import { dataReads } from './dataReads'
import { draftsSweep } from './draftsSweep'
import { engageSend } from './engageSend'
import { eventDispatch } from './eventDispatch'
import { invitationImport } from './invitationImport'
import { inviteSend } from './inviteSend'
import { messageImport } from './messageImport'
import { peopleIndex } from './peopleIndex'
import { postSend } from './postSend'
import { postSweep } from './postSweep'
import { profileImport } from './profileImport'
import { proxyScoring } from './proxyScoring'
import { replySend } from './replySend'
import { replySweep } from './replySweep'
import { retention } from './retention'
import { taskDispatch } from './taskDispatch'
import { dataWallet, workflowEngine } from './workflowEngine'
import { workflowSchedule } from './workflowSchedule'
import { workflowWatchdog } from './workflowWatchdog'

// Every scheduled job the worker runs. Adding one is a file in this folder and one line here.
export const JOBS = unique('job', [
   proxyScoring,
   taskDispatch,
   workflowEngine,
   workflowSchedule,
   workflowWatchdog,
   dataWallet,
   dataReads,
   retention,
   accountDaily,
   messageImport,
   profileImport,
   invitationImport,
   connectionImport,
   replySend,
   replySweep,
   postSend,
   postSweep,
   peopleIndex,
   inviteSend,
   engageSend,
   eventDispatch,
   approvalStart,
   draftsSweep,
   campaignRollup,
])
