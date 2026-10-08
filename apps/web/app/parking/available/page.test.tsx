import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ApiError, apiRequest } from '../../../lib/api-client'
import { AvailableParkingScreen } from './page'

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

beforeEach(() => request.mockReset())

describe('Available parking', () => {
  it('[AC-4] discovers only confirmed claimable spaces and displays server allocation details after a successful claim', async () => {
    request.mockResolvedValueOnce([
      available('release-1', 'P-214', 2),
      { ...available('scheduled', 'P-999', 9), status: 'SCHEDULED' },
    ] as never)
    request.mockResolvedValueOnce({
      status: 'CLAIMED',
      claimant: { id: 'employee-1', displayName: 'Alex Chen', corporateEmail: 'alex@folio3.com' },
      allocationDate: '2026-06-02T00:00:00.000Z',
      allocatedAt: '2026-06-02T15:12:00.000Z',
      assignedFloor: 4,
      spaceCode: 'P-214',
    } as never)

    render(<AvailableParkingScreen />)
    expect(await screen.findByText('P-214')).toBeInTheDocument()
    expect(screen.queryByText('P-999')).not.toBeInTheDocument()
    expect(screen.getByText('1', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByText(/Office time/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Claim space P-214' }))

    expect(await screen.findByRole('heading', { name: 'Parking space claimed' })).toBeInTheDocument()
    expect(screen.getByText('Alex Chen')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText(/June 1, 2026 · 8:12 AM office time/)).toBeInTheDocument()
    expect(request).toHaveBeenLastCalledWith('/parking/releases/release-1/claims', { method: 'POST' })
  })

  it('[AC-5] explains a concurrent unavailable claim and refreshes to the newly confirmed availability', async () => {
    request.mockResolvedValueOnce([available('release-1', 'P-214', 2), available('release-2', 'P-219', 2)] as never)
    request.mockRejectedValueOnce(new ApiError(409, 'Parking space is unavailable'))
    request.mockResolvedValueOnce([available('release-2', 'P-219', 2)] as never)

    render(<AvailableParkingScreen />)
    expect(await screen.findByRole('button', { name: 'Claim space P-214' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Claim space P-214' }))

    expect(await screen.findByText(/Another employee claimed it first/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Claim space P-219' })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Claim space P-214' })).not.toBeInTheDocument()
    expect(request).toHaveBeenCalledTimes(3)
    expect(request).toHaveBeenLastCalledWith('/parking/availability', { cache: 'no-store' })
  })
})
