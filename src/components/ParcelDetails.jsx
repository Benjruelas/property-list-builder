import React from 'react'
import { X, MapPin, Home, DollarSign, Calendar, Square, Users, Info } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'

/**
 * ParcelDetails component - Displays all available parcel data in a nice format
 */
export function ParcelDetails({ isOpen, onClose, parcelData }) {
  if (!parcelData) return null

  const properties = parcelData.properties || {}
  const address = parcelData.address || 
                  properties.SITUS_ADDR || 
                  properties.SITE_ADDR || 
                  properties.ADDRESS || 
                  'No address available'

  // Calculate age (Current Year - Year Built)
  const currentYear = new Date().getFullYear()
  const yearBuilt = properties.YEAR_BUILT ? parseInt(properties.YEAR_BUILT) : null
  const age = yearBuilt ? currentYear - yearBuilt : null

  // Group properties by category
  const basicInfo = [
    { label: 'Property ID', value: properties.PROP_ID },
    { label: 'Address', value: address },
    { label: 'Owner', value: properties.OWNER_NAME },
    { label: 'Land Use', value: properties.LOC_LAND_U },
  ]

  const propertyDetails = [
    { label: 'Year Built', value: properties.YEAR_BUILT },
    { label: 'Age', value: age ? `${age} years` : null },
    { label: 'Square Feet', value: properties.SQFT ? properties.SQFT.toLocaleString() : null },
    { label: 'Acres', value: properties.ACRES },
    { label: 'Bedrooms', value: properties.BEDROOMS },
    { label: 'Bathrooms', value: properties.BATHROOMS },
  ]

  const financialInfo = [
    { label: 'Total Value', value: properties.TOTAL_VALUE ? `$${properties.TOTAL_VALUE.toLocaleString()}` : null },
    { label: 'Land Value', value: properties.LAND_VALUE ? `$${properties.LAND_VALUE.toLocaleString()}` : null },
    { label: 'Improvement Value', value: properties.IMPROVEMENT_VALUE ? `$${properties.IMPROVEMENT_VALUE.toLocaleString()}` : null },
  ]

  const locationInfo = [
    { label: 'Latitude', value: parcelData.lat ? parcelData.lat.toFixed(6) : null },
    { label: 'Longitude', value: parcelData.lng ? parcelData.lng.toFixed(6) : null },
  ]

  // Helper to render a property row
  const renderPropertyRow = (item) => {
    if (!item.value) return null
    return (
      <div key={item.label} className="flex justify-between py-2 border-b border-gray-100 last:border-0">
        <span className="font-semibold text-gray-700">{item.label}:</span>
        <span className="text-gray-900 text-right flex-1 ml-4">{item.value}</span>
      </div>
    )
  }

  // Helper to render a section
  const renderSection = (title, icon, items) => {
    const filteredItems = items.filter(item => item.value)
    if (filteredItems.length === 0) return null

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-lg font-semibold text-gray-800 border-b border-gray-200 pb-2">
          {icon}
          <span>{title}</span>
        </div>
        <div className="space-y-0">
          {filteredItems.map(renderPropertyRow)}
        </div>
      </div>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Parcel Details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Basic Information */}
          {renderSection('Basic Information', <Info className="h-5 w-5" />, basicInfo)}

          {/* Property Details */}
          {renderSection('Property Details', <Home className="h-5 w-5" />, propertyDetails)}

          {/* Financial Information */}
          {renderSection('Financial Information', <DollarSign className="h-5 w-5" />, financialInfo)}

          {/* Location Information */}
          {renderSection('Location', <MapPin className="h-5 w-5" />, locationInfo)}

          {/* Display any additional properties that aren't in our predefined categories */}
          <div className="pt-4 border-t border-gray-200">
            <div className="text-sm text-gray-500">
              <p className="font-semibold mb-2">All Properties:</p>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {Object.entries(properties)
                  .filter(([key]) => 
                    !['PROP_ID', 'SITUS_ADDR', 'SITE_ADDR', 'ADDRESS', 'OWNER_NAME', 'LOC_LAND_U', 
                      'YEAR_BUILT', 'SQFT', 'ACRES', 'BEDROOMS', 'BATHROOMS', 
                      'TOTAL_VALUE', 'LAND_VALUE', 'IMPROVEMENT_VALUE'].includes(key)
                  )
                  .map(([key, value]) => (
                    <div key={key} className="text-xs">
                      <span className="font-medium text-gray-600">{key}:</span>{' '}
                      <span className="text-gray-800">{String(value || 'N/A')}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

