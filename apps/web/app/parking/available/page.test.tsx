import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ApiError, apiRequest } from '../../../lib/api-client'
import { AvailableParkingScreen } from './available-parking-screen'

jest.mock('../../../lib/api-client', () => {
  const actual = jest.requireActual('../../../lib/api-client')
  return { ...actual, apiRequest: jest.fn() }
})

const request = apiRequest as jest.MockedFunction<typeof apiRequest>

const available = (id: string, spaceCode: string, floor: number) => ({
  id,
  status: 'OPEN',
  releaseDate: '2026-06-02T00:00:00.000Z',
  parkingSpace: { id: `parking-${id}`, spaceCode, floor, floorName: null },
})

/**
 * Routes each call by path so a test does not depend on the order the screen happens to issue
 * them in. `availability` is consumed one response per call, mirroring successive refreshes.
 */
function mockApi(options: {
  availability: unknown[][]
  claim?: () => Promise<unknown>
  officeTimeZone?: string
}) {
  const availability = [...options.availability]
  const claims: unknown[] = []
  request.mockImplementation(async (path: string, init?: { method?: string }) => {
    if (path === '/parking/dashboard') {
      return { officeTimeZone: options.officeTimeZone ?? 'America/Los_Angeles' } as never
    }
    if (path === '/parking/claims' && init?.method === 'POST') {
      claims.push(path)
      if (!options.claim) throw new Error('no claim behaviour configured')
      return (await options.claim()) as never
    }
    return (availability.length > 1 ? availability.shift() : availability[0]) as never
  })
  return claims
}

beforeEach(() => request.mockReset())

describe('Available parking', () => {
  it('[AC-4] counts only confirmed claimable spaces and shows the allocation the server assigned', async () => {
    mockApi({
      availability: [
        [available('release-1', 'P-214', 2), { ...available('scheduled', 'P-999', 9), status: 'SCHEDULED' }],
        [],
      ],
      claim: async () => ({
        status: 'CLAIMED',
        claimant: { id: 'employee-1', displayName: 'Alex Chen', corporateEmail: 'alex@folio3.com' },
        allocationDate: '2026-06-02T00:00:00.000Z',
        allocatedAt: '2026-06-02T15:12:00.000Z',
        assignedFloor: 4,
        spaceCode: 'P-214',
      }),
    })

    render(<AvailableParkingScreen />)
    expect(await screen.findByText('1 space available')).toBeInTheDocument()
    expect(screen.getByText('1', { selector: 'strong' })).toBeInTheDocument()

    // The Spec forbids choosing a space, so no per-space claim control may be rendered.
    expect(screen.queryByRole('button', { name: /Claim space P-214/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Claim a parking space' }))

    expect(await screen.findByRole('heading', { name: 'Parking space claimed' })).toBeInTheDocument()
    expect(screen.getByText('Alex Chen')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(request).toHaveBeenCalledWith('/parking/claims', { method: 'POST' })
  })

  it('[AC-4] renders allocation times in the office zone the api reports, not a client default', async () => {
    mockApi({
      availability: [[available('release-1', 'P-214', 2)], []],
      officeTimeZone: 'UTC',
      claim: async () => ({
        status: 'CLAIMED',
        claimant: { id: 'employee-1', displayName: 'Alex Chen', corporateEmail: 'alex@folio3.com' },
        allocationDate: '2026-06-02T00:00:00.000Z',
        allocatedAt: '2026-06-02T15:12:00.000Z',
        assignedFloor: 4,
        spaceCode: 'P-214',
      }),
    })

    render(<AvailableParkingScreen />)
    await screen.findByText('1 space available')
    await waitFor(() => expect(request).toHaveBeenCalledWith('/parking/dashboard', { cache: 'no-store' }))
    fireEvent.click(screen.getByRole('button', { name: 'Claim a parking space' }))

    // 15:12Z is 3:12 PM in UTC; a Los_Angeles default would have shown 8:12 AM on June 1.
    expect(await screen.findByText(/June 2, 2026 · 3:12 PM office time/)).toBeInTheDocument()
  })

  it('[AC-5] explains a concurrent unavailable claim and refreshes to the newly confirmed availability', async () => {
    mockApi({
      availability: [
        [available('release-1', 'P-214', 2), available('release-2', 'P-219', 2)],
        [available('release-2', 'P-219', 2)],
      ],
      claim: async () => { throw new ApiError(409, 'Parking space is unavailable') },
    })

    render(<AvailableParkingScreen />)
    expect(await screen.findByText('2 spaces available')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Claim a parking space' }))

    expect(await screen.findByText(/claimed first/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('1 space available')).toBeInTheDocument())
  })

  it('[AC-4] tells a dedicated holder they are not eligible instead of reporting a lost race', async () => {
    mockApi({
      availability: [[available('release-1', 'P-214', 2)]],
      claim: async () => {
        throw new ApiError(403, 'Employees with a dedicated parking space cannot claim a temporary space')
      },
    })

    render(<AvailableParkingScreen />)
    expect(await screen.findByText('1 space available')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Claim a parking space' }))

    expect(await screen.findByText(/for employees without a dedicated space/)).toBeInTheDocument()
    // The listing must survive an ineligible claim rather than being cleared like a server error.
    expect(screen.getByText('1 space available')).toBeInTheDocument()
  })
})
