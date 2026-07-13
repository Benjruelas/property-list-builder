import { syncLocalBlobStorageIfUserChanged } from './userDataSync'
import { clearLocalLeadsCache } from './leads'
import { resetPipelinesListEtag } from './pipelines'

/** Clear cross-user caches before paint when the signed-in UID changes. */
export function syncAccountSessionUid(uid) {
  if (uid) syncLocalBlobStorageIfUserChanged(uid)
}

/** Clear local lead/pipeline caches on sign-out. */
export function clearAccountSessionCaches() {
  clearLocalLeadsCache()
  resetPipelinesListEtag()
}
