import RouteGuard from '../../route-guard'
import { VehicleVerification } from './vehicle-verification'

export default function Page() {
  const officeTimeZone = process.env.OFFICE_TIME_ZONE || 'UTC'
  const today = new Intl.DateTimeFormat('en-US', {
    timeZone: officeTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const officeDate = `${today.find((part) => part.type === 'year')?.value}-${today.find((part) => part.type === 'month')?.value}-${today.find((part) => part.type === 'day')?.value}`

  return (
    <RouteGuard requiredRoles={['security']}>
      <VehicleVerification officeDate={officeDate} officeTimeZone={officeTimeZone} />
    </RouteGuard>
  )
}
