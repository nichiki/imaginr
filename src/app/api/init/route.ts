// App initialization endpoint - runs startup migrations
import { NextResponse } from 'next/server';
import { runStartupMigrations } from '@/lib/db/migration';

let initialized = false;

export async function GET() {
  try {
    if (!initialized) {
      await runStartupMigrations();
      initialized = true;
    }

    return NextResponse.json({ success: true, initialized: true });
  } catch (error) {
    console.error('Initialization failed:', error);
    return NextResponse.json(
      { error: 'Initialization failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
