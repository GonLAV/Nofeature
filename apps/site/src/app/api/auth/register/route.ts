import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const apiUrl = process.env.API_URL || null
  if (apiUrl) {
    try {
      const res = await fetch(`${apiUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      return NextResponse.json(data, { status: res.status })
    } catch {
      // Fall through to mock
    }
  }
  // Mock response
  return NextResponse.json({
    user: {
      id: '2',
      email: body.email,
      firstName: body.firstName,
      lastName: body.lastName,
      role: 'member',
    },
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
  })
}
