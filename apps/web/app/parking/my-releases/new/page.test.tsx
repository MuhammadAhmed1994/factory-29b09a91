import { fireEvent, render, screen } from '@testing-library/react'
import NewReleasePage from './page'
import { claimabilityGuidance, getReleaseDateBounds } from './release-dates'
import { apiRequest } from '../../../../lib/api-client'

jest.mock('../../../../lib/api-client', () => {
  const actual = jest.requireActual('../../../../lib/api-client')
  return { ...actual, apiRequest: jest.fn() }
})

const mockedApiRequest = jest.mocked(apiRequest)

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2025-05-20T11:00:00.000Z'))
  mockedApiRequest.mockReset()
  mockedApiRequest.mockImplementation(async (path: string) => {
    if (path === '/employees/me') {
      return { employee: { corporateEmail: 'jordan@folio3.com', displayName: 'Jordan Davis' }, roles: ['employee'] } as never
    }
    return undefined as never
  })
})

afterEach(() => {
  jest.useRealTimers()
})

test('[AC-1] date range allows today through 30 days and displays the API release date and status', async () => {
  const bounds = getReleaseDateBounds(new Date('2025-05-20T11:00:00.000Z'))
  expect(bounds).toEqual({ min: '2025-05-20', max: '2025-06-19' })

  mockedApiRequest.mockImplementation(async (path: string, options?: { method?: string }) => {
    if (path === '/employees/me') {
      return { employee: { corporateEmail: 'jordan@folio3.com', displayName: 'Jordan Davis' }, roles: ['employee'] } as never
    }
    if (path === '/parking/releases' && options?.method === 'POST') {
      return [{
        id: 'release-1',
        releaseDate: '2025-05-20T00:00:00.000Z',
        claimableAt: '2025-05-20T12:00:00.000Z',
        status: 'OPEN',
      }] as never
    }
    return [] as never
  })

  render(<NewReleasePage />)

  // The calendar renders exactly the 31 selectable days in the window, and nothing outside it.
  const firstDay = await screen.findByRole('button', { name: '2025-05-20' })
  expect(screen.getByRole('button', { name: '2025-06-19' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '2025-05-19' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '2025-06-20' })).not.toBeInTheDocument()

  expect(firstDay).toHaveAttribute('aria-pressed', 'false')
  fireEvent.click(firstDay)
  expect(firstDay).toHaveAttribute('aria-pressed', 'true')

  fireEvent.click(screen.getByRole('button', { name: /Confirm 1 release/ }))

  expect(await screen.findByText(/Status:/)).toBeInTheDocument()
  expect(screen.getByText('Scheduled (OPEN)')).toBeInTheDocument()
  expect(screen.getAllByText('Tuesday, May 20, 2025').length).toBeGreaterThan(0)
  expect(mockedApiRequest).toHaveBeenCalledWith('/parking/releases', {
    method: 'POST',
    body: JSON.stringify({ releaseDates: ['2025-05-20'] }),
  })
})

test('[AC-3] the calendar schedules several dates in one request and deselects on a second click', async () => {
  const created = [
    { id: 'release-1', releaseDate: '2025-05-20T00:00:00.000Z', claimableAt: '2025-05-20T12:00:00.000Z', status: 'OPEN' },
    { id: 'release-2', releaseDate: '2025-05-22T00:00:00.000Z', claimableAt: '2025-05-22T12:00:00.000Z', status: 'OPEN' },
  ]
  mockedApiRequest.mockImplementation(async (path: string, options?: { method?: string }) => {
    if (path === '/employees/me') {
      return { employee: { corporateEmail: 'jordan@folio3.com', displayName: 'Jordan Davis' }, roles: ['employee'] } as never
    }
    if (path === '/parking/releases' && options?.method === 'POST') return created as never
    return [] as never
  })

  render(<NewReleasePage />)
  const may20 = await screen.findByRole('button', { name: '2025-05-20' })
  const may21 = screen.getByRole('button', { name: '2025-05-21' })
  const may22 = screen.getByRole('button', { name: '2025-05-22' })

  fireEvent.click(may20)
  fireEvent.click(may21)
  fireEvent.click(may22)
  // A second click removes the date again rather than re-adding it.
  fireEvent.click(may21)
  expect(may21).toHaveAttribute('aria-pressed', 'false')

  fireEvent.click(screen.getByRole('button', { name: /Confirm 2 releases/ }))

  expect(await screen.findByText('2 space releases are scheduled.')).toBeInTheDocument()
  expect(mockedApiRequest).toHaveBeenCalledWith('/parking/releases', {
    method: 'POST',
    body: JSON.stringify({ releaseDates: ['2025-05-20', '2025-05-22'] }),
  })
})

test('[AC-3] a date that is already released cannot be selected again', async () => {
  mockedApiRequest.mockImplementation(async (path: string) => {
    if (path === '/employees/me') {
      return { employee: { corporateEmail: 'jordan@folio3.com', displayName: 'Jordan Davis' }, roles: ['employee'] } as never
    }
    if (path === '/parking/releases') {
      return [{ id: 'r1', releaseDate: '2025-05-21T00:00:00.000Z', claimableAt: '2025-05-21T12:00:00.000Z', status: 'OPEN' }] as never
    }
    return undefined as never
  })

  render(<NewReleasePage />)
  const taken = await screen.findByRole('button', { name: '2025-05-21 (Already released)' })
  expect(taken).toBeDisabled()
})

test('[AC-2] future and early same-day releases stay unavailable until the release time and then become claimable', () => {
  const beforeRelease = new Date('2025-05-20T11:59:00.000Z')
  const future = claimabilityGuidance({ releaseDate: '2025-05-21', claimableAt: '2025-05-21T12:00:00.000Z' }, beforeRelease)
  const sameDayBefore = claimabilityGuidance({ releaseDate: '2025-05-20', claimableAt: '2025-05-20T12:00:00.000Z' }, beforeRelease)
  const sameDayAtRelease = claimabilityGuidance({ releaseDate: '2025-05-20', claimableAt: '2025-05-20T12:00:00.000Z' }, new Date('2025-05-20T12:00:00.000Z'))

  expect(future).toMatch(/Not claimable yet/)
  expect(future).toContain('May 21, 2025')
  expect(sameDayBefore).toMatch(/Not claimable yet/)
  expect(sameDayAtRelease).toMatch(/Claimable now/)
  expect(sameDayAtRelease).not.toMatch(/Not claimable yet/)
})
