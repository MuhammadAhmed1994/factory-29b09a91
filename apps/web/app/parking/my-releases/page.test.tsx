import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import MyReleasesPage from './page'
import { apiRequest } from '../../../lib/api-client'

jest.mock('../../../lib/api-client', () => ({ apiRequest: jest.fn() }))

const request = apiRequest as jest.Mock

const openRelease = {
  id: 'release-open',
  releaseDate: '2025-06-20T00:00:00.000Z',
  claimableAt: '2025-06-20T16:00:00.000Z',
  status: 'OPEN',
  parkingSpace: { spaceCode: 'P2-184', floor: 2, floorName: 'West garage' },
  statusChanges: [{ status: 'OPEN', changedAt: '2025-06-19T15:10:00.000Z' }],
}
const claimedRelease = {
  id: 'release-claimed',
  releaseDate: '2025-06-18T00:00:00.000Z',
  status: 'CLAIMED',
  parkingSpace: { spaceCode: 'P2-184', floor: 2, floorName: 'West garage' },
  allocation: { claimant: 'Another employee', allocatedAt: '2025-06-17T16:18:00.000Z' },
  statusChanges: [
    { status: 'OPEN', changedAt: '2025-06-16T15:10:00.000Z' },
    { status: 'CLAIMED', changedAt: '2025-06-17T16:18:00.000Z' },
  ],
}
const cancelledRelease = {
  ...openRelease,
  status: 'CANCELLED',
  statusChanges: [
    { status: 'OPEN', changedAt: '2025-06-19T15:10:00.000Z' },
    { status: 'CANCELLED', changedAt: '2025-06-19T16:30:00.000Z' },
  ],
}

beforeEach(() => {
  request.mockReset()
  request.mockImplementation(async (path: string, options: RequestInit = {}) => {
    if (path === '/employees/me') return { corporateEmail: 'jordan.lee@folio3.com', displayName: 'Jordan Lee' }
    if (path === '/parking/releases' && options.method !== 'DELETE') return [openRelease, claimedRelease]
    if (path === '/parking/releases/release-open' && options.method === 'DELETE') return cancelledRelease
    if (path === '/parking/releases/release-open') return cancelledRelease
    throw new Error(`Unexpected api request: ${path}`)
  })
})

describe('My parking releases', () => {
  it('[AC-3] retrieves release history and requires confirmation before cancelling an unclaimed release', async () => {
    render(<MyReleasesPage />)

    expect(screen.getByRole('heading', { name: 'My parking releases', level: 1 })).toBeInTheDocument()
    await screen.findByText('Release status is up to date')
    expect(screen.getByText('Created Jun 19, 3:10 PM')).toBeInTheDocument()
    expect(screen.getAllByText('office time').length).toBeGreaterThan(0)

    const claimedRow = screen.getByText('Claimed', { selector: 'span' }).closest('tr')
    expect(claimedRow).not.toBeNull()
    expect(within(claimedRow as HTMLElement).queryByRole('button', { name: /cancel release/i })).not.toBeInTheDocument()
    expect(within(claimedRow as HTMLElement).getByText('Cancellation unavailable')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel release for Jun 20, 2025' }))
    expect(screen.getByRole('dialog', { name: 'Cancel this release?' })).toBeInTheDocument()
    expect(request).not.toHaveBeenCalledWith('/parking/releases/release-open', expect.objectContaining({ method: 'DELETE' }))

    fireEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }))
    await waitFor(() => expect(request).toHaveBeenCalledWith('/parking/releases/release-open', expect.objectContaining({ method: 'DELETE' })))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const status = screen.getByLabelText('Status: Cancelled')
    expect(status).toBeInTheDocument()
    expect(status).toHaveFocus()
    expect(screen.getByText('Cancelled Jun 19, 4:30 PM')).toBeInTheDocument()
    expect(request).toHaveBeenCalledWith('/parking/releases/release-open', expect.objectContaining({ cache: 'no-store' }))
  })
})
