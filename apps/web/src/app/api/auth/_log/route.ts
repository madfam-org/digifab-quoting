import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    await request.json(); // Consume the body to prevent errors

    // NextAuth logging endpoint - silently accept logs
    // These can be forwarded to backend logging service if needed

    return new NextResponse(null, { status: 204 });
  } catch {
    // Silently handle errors to prevent client-side noise
    return new NextResponse(null, { status: 204 });
  }
}

export async function GET() {
  return NextResponse.json({ message: 'Auth logging endpoint' });
}
