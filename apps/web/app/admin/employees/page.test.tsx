import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import EmployeeDirectoryPage from './page'

const employee = {
  id: 'emp-1',
  corporateEmail: 'jordan.lee@folio3.com',
  displayName: 'Jordan Lee',
  department: 'Facilities',
  employeeNumber: 'F3-104',
  isActive: true,
}

function jsonResponse(data: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data } as Response
}

function installFetch(handler: typeof fetch) {
  const oldFetch = globalThis.fetch
  const mock = jest.fn(handler) as jest.MockedFunction<typeof fetch>
  globalThis.fetch = mock
  return {
    mock,
    restore() {
      if (oldFetch) globalThis.fetch = oldFetch
      else delete (globalThis as unknown as { fetch?: typeof fetch }).fetch
    },
  }
}

it('[AC-7] lists, retrieves, updates, and deactivates administrator employee records', async () => {
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true)
  const api = installFetch(async (input, init) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (url.endsWith('/admin/employees/emp-1') && method === 'GET') return jsonResponse(employee)
    if (url.endsWith('/admin/employees/emp-1') && method === 'PATCH') return jsonResponse({ ...employee, department: 'Operations' })
    if (url.endsWith('/admin/employees/emp-1') && method === 'DELETE') return { ok: true, status: 204 } as Response
    if (url.endsWith('/admin/employees')) {
      const inactive = api.mock.mock.calls.some(([, request]) => request?.method === 'DELETE')
      return jsonResponse([{ ...employee, department: 'Operations', isActive: inactive ? false : true }])
    }
    throw new Error(`Unexpected API request: ${method} ${url}`)
  })

  render(<EmployeeDirectoryPage />)
  expect((await screen.findAllByText('jordan.lee@folio3.com')).length).toBeGreaterThan(0)
  fireEvent.click(screen.getAllByRole('button', { name: 'Edit profile' })[0])
  expect(await screen.findByRole('heading', { name: 'Edit employee profile' })).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Department (optional)'), { target: { value: 'Operations' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(await screen.findByText(/Employee profile saved\./)).toBeInTheDocument()
  fireEvent.click(screen.getAllByRole('button', { name: 'Deactivate' })[0])
  await waitFor(() => expect(api.mock).toHaveBeenCalledWith(expect.stringContaining('/admin/employees/emp-1'), expect.objectContaining({ method: 'DELETE', credentials: 'include', headers: expect.objectContaining({ Accept: 'application/json' }) })))
  expect(await screen.findByText(/Employee record deactivated/)).toBeInTheDocument()
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining(employee.corporateEmail))
  confirm.mockRestore()
  api.restore()
})

it('[AC-8] validates corporate identity and confirms a created employee profile', async () => {
  const api = installFetch(async (input, init) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (url.endsWith('/admin/employees') && method === 'GET') return jsonResponse(api.mock.mock.calls.some(([, request]) => request?.method === 'POST') ? [employee] : [])
    if (url.endsWith('/admin/employees') && method === 'POST') return jsonResponse(employee)
    throw new Error(`Unexpected API request: ${method} ${url}`)
  })

  render(<EmployeeDirectoryPage />)
  await waitFor(() => expect(screen.queryByLabelText('Loading employee records')).not.toBeInTheDocument())
  fireEvent.change(screen.getByLabelText(/Corporate email/), { target: { value: 'jordan@gmail.com' } })
  fireEvent.change(screen.getByLabelText(/Employee name/), { target: { value: 'Jordan Lee' } })
  fireEvent.change(screen.getByLabelText('Department (optional)'), { target: { value: 'Facilities' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create employee' }))
  expect(await screen.findByText('Enter a valid Folio3 corporate email (name@folio3.com).')).toBeInTheDocument()
  expect(api.mock.mock.calls.filter(([, request]) => request?.method === 'POST')).toHaveLength(0)

  fireEvent.change(screen.getByLabelText(/Corporate email/), { target: { value: employee.corporateEmail } })
  fireEvent.click(screen.getByRole('button', { name: 'Create employee' }))
  const savedLabel = await screen.findByText('Employee profile saved.')
  expect(savedLabel.closest('[role="status"]')).toHaveTextContent(employee.corporateEmail)
  expect(savedLabel.closest('[role="status"]')).toHaveTextContent('Jordan Lee · Facilities')
  expect(api.mock).toHaveBeenCalledWith(expect.stringMatching(/\/admin\/employees$/), expect.objectContaining({ method: 'POST', body: expect.stringContaining('jordan.lee@folio3.com') }))
  api.restore()
})
