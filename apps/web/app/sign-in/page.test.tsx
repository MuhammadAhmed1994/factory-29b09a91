import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import SignInPage from './page'
import { apiRequest } from '../../lib/api-client'

const mockRouterPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))
jest.mock('../../lib/api-client', () => ({ apiRequest: jest.fn() }))

const apiRequestMock = jest.mocked(apiRequest)

test('[AC-8] signs in through Workspace and communicates authorized and unauthorized states', async () => {
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = 'test-google-client-id'
  let credentialCallback: ((response: { credential: string }) => void) | undefined
  const prompt = jest.fn()
  const initialize = jest.fn((options: { callback: (response: { credential: string }) => void }) => {
    credentialCallback = options.callback
  })
  Object.defineProperty(window, 'google', {
    configurable: true,
    value: { accounts: { id: { initialize, prompt } } },
  })

  apiRequestMock
    .mockRejectedValueOnce(new Error('private provider details'))
    .mockResolvedValueOnce({
      accessToken: 'signed-session-token',
      expiresIn: 28800,
      employee: { corporateEmail: 'employee@folio3.com', roles: ['PARKING_ADMINISTRATOR'] },
    })

  render(<SignInPage />)
  expect(screen.getByRole('heading', { name: 'Sign in to Folio3 Parking' })).toBeInTheDocument()
  expect(screen.getByText(/Personal Google accounts are not permitted/)).toBeInTheDocument()
  const button = screen.getByRole('button', { name: 'Continue with Google Workspace' })

  fireEvent.click(button)
  await waitFor(() => expect(initialize).toHaveBeenCalled())
  expect(prompt).toHaveBeenCalled()
  expect(screen.getByRole('status')).toHaveTextContent('Connecting to Google Workspace…')
  expect(button).toBeDisabled()
  await act(async () => credentialCallback?.({ credential: 'untrusted-google-identity' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(
    'This account is not authorized to use Folio3 Parking. Sign in with an approved work account.',
  ))
  expect(screen.getByRole('alert')).not.toHaveTextContent('private provider details')

  fireEvent.click(screen.getByRole('button', { name: 'Continue with Google Workspace' }))
  await waitFor(() => expect(initialize).toHaveBeenCalledTimes(2))
  expect(screen.getByRole('status')).toHaveTextContent('Connecting to Google Workspace…')
  await act(async () => credentialCallback?.({ credential: 'approved-google-identity' }))

  expect(await screen.findByRole('status')).toHaveTextContent('employee@folio3.com')
  expect(apiRequestMock).toHaveBeenCalledWith('/auth/google/session', {
    method: 'POST',
    body: JSON.stringify({ credential: 'approved-google-identity' }),
  })
  expect(document.cookie).toContain('parking_session=signed-session-token')
  expect(mockRouterPush).toHaveBeenCalledWith('/admin')
  expect(screen.getByText(/Personal Google accounts are not permitted/)).toBeInTheDocument()
})
