import { ConfirmRunDialog } from './confirm-run-dialog'
import { DeleteAccountDialog } from './delete-account-dialog'
import { EditAccountDialog } from './edit-account-dialog'
import { PauseDialog } from './pause-dialog'
import { ReadMessagesDialog } from './read-messages-dialog'
import { RevealDialog } from './reveal-dialog'
import { StartAnywayDialog } from './start-anyway-dialog'
import { type AccountActions } from './use-account-actions'

// The dialogs behind the account actions, for any page that offers them.
export const AccountDialogs = ({ actions }: { actions: AccountActions }) => (
   <>
      <RevealDialog reveal={actions.reveal} />
      <EditAccountDialog account={actions.toEdit} onClose={() => actions.askEdit(null)} />
      <DeleteAccountDialog
         account={actions.toDelete}
         onCancel={() => actions.askDelete(null)}
         onConfirm={actions.confirmDelete}
      />
      <PauseDialog accounts={actions.toPause} onCancel={actions.cancelPause} onConfirm={actions.confirmPause} />
      <ReadMessagesDialog
         account={actions.toReadMessages}
         onCancel={() => actions.askMessages(null)}
         onConfirm={actions.confirmMessages}
      />
      <ConfirmRunDialog message={actions.recent} onCancel={actions.cancelRecent} onConfirm={actions.confirmRecent} />
      <StartAnywayDialog
         message={actions.blocked}
         onCancel={actions.cancelBlocked}
         onConfirm={actions.confirmBlocked}
      />
   </>
)
