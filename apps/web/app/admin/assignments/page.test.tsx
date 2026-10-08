import { render, screen, waitFor } from '@testing-library/react'
import AssignmentsPage from './page'
import { apiRequest } from '../../../lib/api-client'

jest.mock('../../../lib/api-client', () => ({
  apiRequest: jest.fn(),
  ApiError: class ApiError extends Error {
    status: number
    details: unknown
    constructor(status: number, message: string, details?: unknown) {
      super(message)
      this.status = status
      this.details = details
    }
  },
}))

const mockedApiRequest = jest.mocked(apiRequest)

describe('administrator assignments access', () => {
  beforeEach(() => mockedApiRequest.mockReset())

  it('[AC-7] denies assignment management to an employee without administrator role', async () => {
    mockedApiRequest.mockResolvedValue({
      employee: { id: 'employee-1', corporateEmail: 'staff@folio3.com', displayName: 'Staff Member' },
      roles: ['employee'],
    } as never)

    render(<AssignmentsPage />)

    expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument()
    expect(screen.getByText('You do not have permission to view this page.')).toBeInTheDocument()
    await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledWith('/employees/me'))
  })
})
