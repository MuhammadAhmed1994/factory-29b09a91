import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { apiRequest } from '../../../lib/api-client'
import { VehicleVerification } from './vehicle-verification'

jest.mock('../../../lib/api-client', () => ({
  apiRequest: jest.fn(),
  ApiError: class ApiError extends Error {
    constructor(readonly status: number, message = '') { super(message) }
  },
}))

const mockedApiRequest = jest.mocked(apiRequest)

describe('Vehicle verification screen', () => {
  beforeEach(() => mockedApiRequest.mockReset())

  it('[AC-6] submits the vehicle identifier once and displays the current-day authorization result', async () => {
    let resolveRequest!: (value: {
      vehicleIdentifier: string
      date: string
      authorized: boolean
      outcome: string
      allocatedAt: string
    }) => void
    mockedApiRequest.mockImplementation(() => new Promise((resolve) => { resolveRequest = resolve }) as never)

    render(<VehicleVerification officeDate="2026-06-01" officeTimeZone="UTC" />)
    expect(screen.getByText('Enter a vehicle identifier to check authorization.')).toBeInTheDocument()
    expect(screen.getByText(/Vehicles with permanent stickers follow the existing entrance process/)).toBeInTheDocument()

    const input = screen.getByRole('textbox', { name: 'Vehicle identifier' })
    fireEvent.change(input, { target: { value: 'ABC-1234' } })
    const form = input.closest('form')
    expect(form).not.toBeNull()
    fireEvent.submit(form!)

    expect(screen.getByText('Checking today’s allocation…')).toBeInTheDocument()
    expect(input).toHaveValue('ABC-1234')
    expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled()
    fireEvent.submit(form!)
    expect(mockedApiRequest).toHaveBeenCalledTimes(1)
    expect(mockedApiRequest).toHaveBeenCalledWith('/security/vehicle-verifications', {
      method: 'POST',
      body: JSON.stringify({ vehicleIdentifier: 'ABC-1234' }),
    })

    resolveRequest({
      vehicleIdentifier: 'ABC-1234',
      date: '2026-06-01',
      authorized: true,
      outcome: 'TEMPORARY_ALLOCATION_AUTHORIZED',
      allocatedAt: '2026-06-01T09:15:00.000Z',
    })
    expect(await screen.findByRole('heading', { name: 'Authorized' })).toBeInTheDocument()
    expect(screen.getByText(/Vehicle:/)).toHaveTextContent('ABC-1234')
    expect(screen.getByText(/Allocation date:/)).toHaveTextContent('Monday, June 1, 2026')
    expect(screen.getByText(/Allocation time:/)).toHaveTextContent('9:15 AM office time')

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(input).toHaveValue('')
    await waitFor(() => expect(screen.getByText('Enter a vehicle identifier to check authorization.')).toBeInTheDocument())
  })
})
