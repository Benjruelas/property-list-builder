import { useLayoutEffect } from 'react'
import { syncLocalBlobStorageIfUserChanged } from '../utils/userDataSync'
import { clearLocalLeadsCache } from '../utils/leads'
import { resetPipelinesListEtag } from '../utils/pipelines'

/**
 * Account session isolation — clear cross-user caches before paint on UID change.
 */
export function useAccountSession(currentUser) {
  useLayoutEffect(() => {
    if (currentUser?.uid) {
      syncLocalBlobStorageIfUserChanged(currentUser.uid)
    }
  }, [currentUser?.uid])

  const onLogout = () => {
    clearLocalLeadsCache()
    resetPipelinesListEtag()
  }

  return { onLogout }
}
