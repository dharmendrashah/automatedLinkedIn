import { type ConfirmChannel, type ConsumeMessage } from 'amqplib'

import { VALIDATED_KEY, VALIDATE_KEY, type ValidateAccountResult } from '@automatedLinkedIn/contracts'

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
export const republishTask = (channel: Publisher, message: ConsumeMessage, retries: number) =>
   publish(channel, TASK_KEY, message.content, String(message.properties.messageId), { [RETRIES_HEADER]: retries })

// The answer to brain's "is this LinkedIn login valid".
export const publishValidationResult = (channel: Publisher, result: ValidateAccountResult) =>
   publish(channel, VALIDATED_KEY, Buffer.from(JSON.stringify(result)), result.validation_id)

export const republishValidation = (channel: Publisher, message: ConsumeMessage, retries: number) =>
   publish(channel, VALIDATE_KEY, message.content, String(message.properties.messageId), { [RETRIES_HEADER]: retries })
