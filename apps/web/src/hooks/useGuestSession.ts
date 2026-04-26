import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import Cookies from 'js-cookie';

interface GuestSession {
  id: string;
  token: string;
  createdAt: Date;
  quoteCount: number;
}

const COOKIE_NAME = 'guest_session';
const SESSION_STORAGE_KEY = 'guest_session_data';

export function useGuestSession() {
  const [session, setSession] = useState<GuestSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    initializeSession();
  }, []);

  const initializeSession = () => {
    try {
      // Check for existing session cookie
      let sessionToken = Cookies.get(COOKIE_NAME);

      if (!sessionToken) {
        // Create new session
        sessionToken = uuidv4();
        Cookies.set(COOKIE_NAME, sessionToken, {
          expires: 1, // 1 day
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
        });
      }

      // Load or create session data
      const storedData = sessionStorage.getItem(SESSION_STORAGE_KEY);
      let sessionData: GuestSession;

      if (storedData) {
        sessionData = JSON.parse(storedData);
        // Verify token matches
        if (sessionData.token !== sessionToken) {
          sessionData = createNewSessionData(sessionToken);
        }
      } else {
        sessionData = createNewSessionData(sessionToken);
      }

      setSession(sessionData);
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
    } catch (error) {
      console.error('Failed to initialize guest session:', error);
      // Create fallback session
      const fallbackSession = createNewSessionData(uuidv4());
      setSession(fallbackSession);
    } finally {
      setIsLoading(false);
    }
  };

  const createNewSessionData = (token: string): GuestSession => ({
    id: uuidv4(),
    token,
    createdAt: new Date(),
    quoteCount: 0,
  });

  const incrementQuoteCount = () => {
    if (session) {
      const updatedSession = {
        ...session,
        quoteCount: session.quoteCount + 1,
      };
      setSession(updatedSession);
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(updatedSession));
    }
  };

  const clearSession = () => {
    Cookies.remove(COOKIE_NAME);
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    setSession(null);
    initializeSession();
  };

  return {
    session,
    isLoading,
    incrementQuoteCount,
    clearSession,
  };
}
