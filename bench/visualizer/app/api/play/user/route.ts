import { NextRequest, NextResponse } from 'next/server';
import { createUser, validateUser, getUser } from '@/lib/play-storage';

export const dynamic = 'force-dynamic';

// POST: Register or login user
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password, action } = body;

    if (!username || typeof username !== 'string') {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    // Validate username format
    if (username.length < 2 || username.length > 30) {
      return NextResponse.json(
        { error: 'Username must be 2-30 characters' },
        { status: 400 }
      );
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return NextResponse.json(
        { error: 'Username can only contain letters, numbers, underscores, and hyphens (no spaces)' },
        { status: 400 }
      );
    }

    if (action === 'register') {
      // Check if user exists
      const existingUser = await getUser(username);
      if (existingUser) {
        return NextResponse.json(
          { error: 'Username already taken' },
          { status: 409 }
        );
      }

      const user = await createUser(username, password);
      if (!user) {
        return NextResponse.json(
          { error: 'Failed to create user' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          hasPassword: !!user.passwordHash
        }
      });
    } else {
      // Login
      const user = await validateUser(username, password);
      if (!user) {
        const existingUser = await getUser(username);
        if (existingUser && existingUser.passwordHash && !password) {
          return NextResponse.json(
            { error: 'Password required for this account' },
            { status: 401 }
          );
        }
        if (existingUser && existingUser.passwordHash) {
          return NextResponse.json(
            { error: 'Incorrect password' },
            { status: 401 }
          );
        }
        // User doesn't exist, create them
        const newUser = await createUser(username, password);
        if (!newUser) {
          return NextResponse.json(
            { error: 'Failed to create user' },
            { status: 500 }
          );
        }
        return NextResponse.json({
          success: true,
          user: {
            id: newUser.id,
            username: newUser.username,
            hasPassword: !!newUser.passwordHash
          },
          created: true
        });
      }

      return NextResponse.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          hasPassword: !!user.passwordHash
        }
      });
    }
  } catch (error) {
    console.error('User API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
