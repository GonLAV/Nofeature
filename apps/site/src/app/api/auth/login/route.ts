import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()
  const apiUrl = process.env.API_URL || null
  if (apiUrl) {
    try {
      const res = await fetch(`${apiUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      return NextResponse.json(data, { status: res.status })
    } catch {
      // Fall through to mock
    }
  }
  // Mock response
  return NextResponse.json({
    user: { id: '1', email, firstName: 'Demo', lastName: 'User', role: 'admin' },
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
  })
}
