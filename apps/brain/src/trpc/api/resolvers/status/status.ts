import { StatusService } from 'serviceStatus'

import { router, userProcedure } from 'trpc'

// Whether each module is live or dead right now. Open to anyone who has signed in; nothing is saved.
export const status = router({ get: userProcedure.query(() => StatusService.snapshot()) })
