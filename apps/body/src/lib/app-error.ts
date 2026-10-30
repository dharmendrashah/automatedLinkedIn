// A lazy page whose file is gone because a new version was deployed since the app was opened.
const NEW_VERSION =
   /dynamically imported module|Importing a module script failed|Unable to preload CSS|Loading chunk \d+ failed/i

export const isNewVersionError = (error: unknown) => error instanceof Error && NEW_VERSION.test(error.message)

// What the owner copies for support: no page data, only the error, where and when.
export const errorDetails = (error: Error, path: string, at: Date) =>
   `${error.name}: ${error.message}\nPage: ${path}\nTime: ${at.toISOString()}`

// Every error the app catches comes here; Sentry will be sent from this one place.
export const reportError = (error: Error, context: { where: string; componentStack?: string | null }) => {
   console.error(`[${context.where}]`, error, context.componentStack ?? '')
}
