import { render, screen, waitFor } from '@testing-library/react'
import AdminPage from './page'
import { apiRequest } from '../../lib/api-client'

jest.mock('../../lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) { super(message) }
  },
  apiRequest: jest.fn(),
}))

const mockedApiRequest = jest.mocked(apiRequest)

describe('[AC-7] administrator parking operations overview', () => {
  it('[AC-7] shows authorized report activity and module links, an empty state, and access denial', async () => {
    let session: unknown = {
      corporateEmail: 'jordan.lee@folio3.com',
      displayName: 'Jordan Lee',
      roles: [{ role: 'PARKING_ADMINISTRATOR' }],
    }
    let report: unknown = {
      reportType: 'allocations',
      data: [{
        id: 'allocation-1',
        allocatedAt: '2026-06-01T16:12:00.000Z',
        employee: { id: 'employee-1', displayName: 'Maya Chen', corporateEmail: 'maya.chen@folio3.com' },
        parkingRelease: {
          parkingAssignment: { parkingSpace: { spaceCode: 'P-214', parkingFloor: { floorNumber: 2 } } },
        },
      }],
    }
    mockedApiRequest.mockImplementation(async (path) => {
      if (path === '/employees/me') return session as never
      if (path === '/admin/configuration') return { officeTimeZone: 'America/Los_Angeles' } as never
      if (path.startsWith('/admin/reports?')) return report as never
      throw new Error(`Unexpected API request: ${path}`)
    })

    const firstView = render(<AdminPage />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Parking operations' })).toBeInTheDocument()
    expect(screen.getByText('Jordan Lee')).toBeInTheDocument()
    expect(await screen.findByText('Maya Chen')).toBeInTheDocument()
    expect(screen.getByText('Today’s parking allocations')).toBeInTheDocument()
    expect(screen.getByText(/P-214/)).toBeInTheDocument()
    for (const [name, href] of [
      ['Assignments', '/admin/assignments'],
      ['Employees', '/admin/employees'],
      ['Configuration', '/admin/configuration'],
      ['Reports', '/admin/reports'],
    ]) {
      const moduleLink = screen.getAllByRole('link', { name: new RegExp(name) }).find((link) => link.getAttribute('href') === href)
      expect(moduleLink).toBeInTheDocument()
      expect(moduleLink).toHaveAttribute('href', href)
    }
    await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledWith(expect.stringMatching(/^\/admin\/reports\?/)))

    firstView.unmount()
    report = { reportType: 'allocations', data: [] }
    const emptyView = render(<AdminPage />)
    expect(await screen.findByText('No operational activity to show yet.')).toBeInTheDocument()

    emptyView.unmount()
    session = { corporateEmail: 'employee@folio3.com', displayName: 'Sam Employee', roles: [{ role: 'EMPLOYEE' }] }
    render(<AdminPage />)
    expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Administrator navigation' })).not.toBeInTheDocument()
  })
})
