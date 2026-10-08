import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ConfigurationPage from './page'
import { apiRequest } from '../../../lib/api-client'

jest.mock('../../../lib/api-client', () => ({ apiRequest: jest.fn() }))

const mockApiRequest = jest.mocked(apiRequest)
const adminSession = { employee: { corporateEmail: 'admin@folio3.com', displayName: 'Admin' }, roles: ['administrator'] }
const timeInput = () => screen.getByLabelText('Daily Parking Release Time', { selector: 'input' })

beforeEach(() => {
  mockApiRequest.mockReset()
})

test('[AC-2] holds the labeled time control disabled during loading and applies the 08:00 office-time default', async () => {
  let resolveConfiguration!: (value: { dailyParkingReleaseTime: null; officeTimeZone: string }) => void
  const configuration = new Promise<{ dailyParkingReleaseTime: null; officeTimeZone: string }>((resolve) => { resolveConfiguration = resolve })
  mockApiRequest.mockImplementation((path) => {
    if (path === '/employees/me') return Promise.resolve(adminSession) as ReturnType<typeof apiRequest>
    return configuration as ReturnType<typeof apiRequest>
  })

  render(<ConfigurationPage />)
  expect(timeInput()).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('Loading configuration')

  await act(async () => {
    resolveConfiguration({ dailyParkingReleaseTime: null, officeTimeZone: 'America/Los_Angeles' })
  })
  await waitFor(() => expect(timeInput()).toBeEnabled())
  expect(timeInput()).toHaveValue('08:00')
  expect(screen.getByText(/Office time · America\/Los_Angeles/)).toBeInTheDocument()
  expect(mockApiRequest).toHaveBeenCalledWith('/admin/configuration')

  fireEvent.change(timeInput(), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: /Save release time/ }))
  expect(screen.getByRole('alert')).toHaveTextContent('valid office-local time in HH:mm format')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('[AC-7] confirms before updating configuration, shows office-time success, and preserves input when saving fails', async () => {
  mockApiRequest.mockImplementation((path, options) => {
    if (path === '/employees/me') return Promise.resolve(adminSession) as ReturnType<typeof apiRequest>
    if (!options) return Promise.resolve({ dailyParkingReleaseTime: '08:00', officeTimeZone: 'America/Los_Angeles' }) as ReturnType<typeof apiRequest>
    if (options.method === 'PATCH' && JSON.parse(String(options.body)).dailyParkingReleaseTime === '09:00') {
      return Promise.resolve({ dailyParkingReleaseTime: '09:00', officeTimeZone: 'America/Los_Angeles' }) as ReturnType<typeof apiRequest>
    }
    return Promise.reject(new Error('service unavailable')) as ReturnType<typeof apiRequest>
  })

  render(<ConfigurationPage />)
  await waitFor(() => expect(timeInput()).toBeEnabled())
  fireEvent.change(timeInput(), { target: { value: '09:00' } })
  fireEvent.click(screen.getByRole('button', { name: /Save release time/ }))
  expect(screen.getByRole('dialog')).toHaveTextContent('09:00')
  expect(mockApiRequest).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('button', { name: 'Confirm save' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Saved time: 09:00 · America/Los_Angeles office time')

  fireEvent.change(timeInput(), { target: { value: '10:00' } })
  fireEvent.click(screen.getByRole('button', { name: /Save release time/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm save' }))
  expect(await screen.findByRole('alert')).toHaveTextContent("Configuration couldn't be saved. Your previous setting remains in effect.")
  expect(timeInput()).toHaveValue('10:00')
  expect(screen.queryByText('Daily Parking Release Time updated.')).not.toBeInTheDocument()
  await waitFor(() => expect(mockApiRequest).toHaveBeenCalledWith('/admin/configuration', expect.objectContaining({
    method: 'PATCH',
    body: JSON.stringify({ dailyParkingReleaseTime: '10:00' }),
  })))
})
