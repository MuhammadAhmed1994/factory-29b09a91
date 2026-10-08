import { fireEvent, render, screen } from '@testing-library/react'
import NewReleasePage, { claimabilityGuidance, getReleaseDateBounds } from './page'
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

  mockedApiRequest.mockImplementation(async (path: string) => {
    if (path === '/employees/me') {
      return { employee: { corporateEmail: 'jordan@folio3.com', displayName: 'Jordan Davis' }, roles: ['employee'] } as never
    }
    return {
      id: 'release-1',
      releaseDate: '2025-05-20T00:00:00.000Z',
      claimableAt: '2025-05-20T12:00:00.000Z',
      status: 'OPEN',
    } as never
  })

  render(<NewReleasePage />)
  const dateInput = await screen.findByLabelText('Release date') as HTMLInputElement
  expect(dateInput.min).toBe('2025-05-20')
  expect(dateInput.max).toBe('2025-06-19')
  expect(dateInput.value).toBe('2025-05-20')
  fireEvent.click(screen.getByRole('button', { name: 'Confirm release' }))

  expect(await screen.findByText(/Status:/)).toBeInTheDocument()
  expect(screen.getByText('Scheduled (OPEN)')).toBeInTheDocument()
  expect(screen.getAllByText('Tuesday, May 20, 2025').length).toBeGreaterThan(0)
  expect(mockedApiRequest).toHaveBeenCalledWith('/parking/releases', {
    method: 'POST',
    body: JSON.stringify({ releaseDate: '2025-05-20' }),
  })
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
