import { type ProxyConfig } from '@automatedLinkedIn/contracts'

// Message contracts shared by the API and the worker.

export type ScraperActionType = 'login' | 'navigate' | 'interaction' | 'extract'

export interface ActionParam {
   url?: string
   wait_for_selector?: string
   click_element?: string
   selectors?: {
      wrapper: string
      author: string
      text: string
      [key: string]: string
   }
   use_session_cookies?: boolean
}

export interface ScraperAction {
   step: number
   action: ScraperActionType
   params: ActionParam
}

// A proxy the browser connects through for one task. It carries credentials, so it is never logged or echoed.
export type { ProxyConfig }

export interface ScrapeTaskCommand {
   task_id: string
   task_type: string
   timestamp: string
   // Only seeds an account that has no stored session yet. Must be inside sessions/.
   auth_session_key?: string
   // The LinkedIn account the task runs for: its session is loaded first and saved back, one task at a time.
   account_id?: string
   proxy?: ProxyConfig
   target_url: string
   actions: ScraperAction[]
}

export interface ScrapeTaskResult {
   task_id: string
   task_type: string
   status: 'SUCCESS' | 'FAILED'
   timestamp: string
   execution_time_seconds: number
   result_storage_path: string | null
   // Where the refreshed session of `account_id` was saved. Never the cookie values.
   session_storage_path?: string
   error: string | null
}

// One element matched by `selectors.wrapper`, with the text found by each other selector.
export type ExtractedRecord = Record<string, string | null>

// The part of a Playwright cookie that spider reads from a stored session.
export interface SessionCookie {
   name: string
   value: string
   domain: string
   path: string
   expires?: number
   httpOnly?: boolean
   secure?: boolean
   sameSite?: 'Strict' | 'Lax' | 'None'
}
