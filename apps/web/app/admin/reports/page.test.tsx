import { render, screen, waitFor } from '@testing-library/react'
import ReportsPage from './page'

const response = (payload: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload,
})

describe('administrator reports', () => {
  it('[AC-7] authorized administrator retrieves a selected parking report with its date period', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(response({ roles: ['administrator'], employee: { corporateEmail: 'admin@folio3.com' } }) as Response)
      .mockResolvedValueOnce(response({
        reportType: 'allocations',
        startDate: '2026-05-01',
        endDate: '2026-05-31',
        data: [{ id: 'allocation-1', allocatedAt: '2026-05-12T09:00:00.000Z', employeeId: 'employee-1' }],
      }) as Response)
    global.fetch = fetchMock as jest.MockedFunction<typeof fetch>

    render(<ReportsPage />)

    expect(await screen.findByRole('heading', { name: 'Parking reports' })).toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock.mock.calls[0][0]).toContain('/employees/me')
    const reportUrl = new URL(String(fetchMock.mock.calls[1][0]))
    expect(reportUrl.pathname).toBe('/admin/reports')
    expect(reportUrl.searchParams.get('reportType')).toBe('allocations')
    expect(reportUrl.searchParams.get('startDate')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(reportUrl.searchParams.get('endDate')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(await screen.findByRole('table')).toHaveAccessibleName(/Parking allocations report/)
    expect(screen.getByRole('columnheader', { name: 'Allocated At' })).toBeInTheDocument()
    expect(screen.getByText('Report ready.')).toBeInTheDocument()
  })
})
