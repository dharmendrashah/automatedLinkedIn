import { type ConfirmChannel, type Message } from 'amqplib'

import {
   TASK_KEY as RUN_KEY,
   TASK_CATALOG_KEY,
   TASK_DONE_KEY,
   type TaskCatalog,
   type TaskResult,
} from '@automatedLinkedIn/contracts'

import { type ScrapeTaskCommand, type ScrapeTaskResult } from '../types'

import { RETRIES_HEADER } from './consumer'
import { EXCHANGE, RESULT_KEY, TASK_KEY } from './topology'

type Publisher = Pick<ConfirmChannel, 'publish' | 'waitForConfirms'>

const publish = async (
   channel: Publisher,
   key: string,
   body: Buffer,
   id: string,
   headers: Record<string, number> = {}
) => {
   channel.publish(EXCHANGE, key, body, {
      persistent: true,
      contentType: 'application/json',
      messageId: id,
      headers,
   })

   // Resolves only once the broker has taken responsibility for the message.
   await channel.waitForConfirms()
}

export const publishTask = (channel: Publisher, command: ScrapeTaskCommand) =>
   publish(channel, TASK_KEY, Buffer.from(JSON.stringify(command)), command.task_id)

export const publishResult = (channel: Publisher, result: ScrapeTaskResult) =>
   publish(channel, RESULT_KEY, Buffer.from(JSON.stringify(result)), result.task_id)

// A retry is the same task body published again with a counter, so the original can be acknowledged.
export const republishTask = (channel: Publisher, message: Message, retries: number) =>
   publish(channel, TASK_KEY, message.content, String(message.properties.messageId), { [RETRIES_HEADER]: retries })

// The answer to a task of the standard contract (.plan/spider-task-framework.md).
export const publishRunResult = (channel: Publisher, result: TaskResult) =>
   publish(channel, TASK_DONE_KEY, Buffer.from(JSON.stringify(result)), result.task_id)

export const republishRun = (channel: Publisher, message: Message, retries: number) =>
   publish(channel, RUN_KEY, message.content, String(message.properties.messageId), { [RETRIES_HEADER]: retries })

// Every task this worker can run, in one message: brain keeps the latest.
export const publishCatalog = (channel: Publisher, catalog: TaskCatalog) =>
   publish(channel, TASK_CATALOG_KEY, Buffer.from(JSON.stringify(catalog)), `catalog-${catalog.worker.build}`)
