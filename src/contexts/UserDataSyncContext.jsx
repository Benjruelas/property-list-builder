import { createContext, useContext, useCallback } from 'react'
import { scheduleUserDataSync as doSchedule } from '../utils/userDataSync'

const UserDataSyncContext = createContext({ scheduleSync: () => {} })

export const useUserDataSync = () => {
  const ctx = useContext(UserDataSyncContext)
  return ctx
}

export function UserDataSyncProvider({ children, getToken }) {
  const scheduleSync = useCallback(() => {
    if (getToken) doSchedule(getToken)
  }, [getToken])

  return (
    <UserDataSyncContext.Provider value={{ scheduleSync }}>
      {children}
    </UserDataSyncContext.Provider>
  )
}
