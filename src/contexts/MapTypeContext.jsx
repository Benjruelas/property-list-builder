import { createContext, useContext } from 'react'

const MapTypeContext = createContext('street')

export const useMapType = () => useContext(MapTypeContext)

export const MapTypeProvider = ({ children, mapType }) => (
  <MapTypeContext.Provider value={mapType}>{children}</MapTypeContext.Provider>
)
