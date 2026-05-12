import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import type {
  FirebaseAuthTypes,
} from '@react-native-firebase/auth';
import { auth } from '@/services/firebase';
import { loginUser, getMe } from '@/services/api';
import { GOOGLE_WEB_CLIENT_ID } from '@/utils/constants';
import type { Role, User } from '@/types';

interface AuthContextValue {
  user: User | null;
  firebaseUser: FirebaseAuthTypes.User | null;
  loading: boolean;
  signingIn: boolean;
  signInError: string | null;
  signInWithGoogle: (role: Role) => Promise<User | null>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

let googleConfigured = false;

function configureGoogle(): void {
  if (googleConfigured) return;
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    offlineAccess: false,
    forceCodeForRefreshToken: false,
  });
  googleConfigured = true;
}

export function AuthProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const initialAuthHandled = useRef(false);

  // Configure Google Sign-In once.
  useEffect(() => {
    configureGoogle();
  }, []);

  // Listen to Firebase auth state.
  useEffect(() => {
    const unsubscribe = auth().onAuthStateChanged(async (fbUser) => {
      setFirebaseUser(fbUser);
      if (!fbUser) {
        setUser(null);
        setLoading(false);
        initialAuthHandled.current = true;
        return;
      }
      // Try to fetch our backend profile. On the very first sign-in the backend
      // hasn't created the user yet (it only happens inside signInWithGoogle when
      // we POST /auth/login with the chosen role) — so we MUST NOT clobber
      // `user` to null here, otherwise the root `index.tsx` will bounce the user
      // back to role-selection mid-sign-in.
      try {
        const profile = await getMe();
        setUser(profile);
      } catch {
        // Leave the existing `user` value alone. signInWithGoogle will populate it
        // once /auth/login completes. On legitimate failures, `user` was already
        // null and stays that way, which still routes to the auth stack.
      } finally {
        setLoading(false);
        initialAuthHandled.current = true;
      }
    });
    return unsubscribe;
  }, []);

  const signInWithGoogle = useCallback(async (role: Role): Promise<User | null> => {
    setSigningIn(true);
    setSignInError(null);
    try {
      configureGoogle();
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      // Some installations need a clean slate so user can pick an account.
      try {
        await GoogleSignin.signOut();
      } catch {
        // ignore
      }
      const result = await GoogleSignin.signIn();
      // google-signin v13 returns { type: 'success', data: { idToken, user } } or { type: 'cancelled' }.
      // Older typings put idToken at the top level. Handle both.
      const idToken =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (result as any)?.idToken ??
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (result as any)?.data?.idToken ??
        null;
      if (!idToken) {
        throw new Error('Google sign-in did not return an ID token.');
      }
      const credential = auth.GoogleAuthProvider.credential(idToken);
      await auth().signInWithCredential(credential);
      // Tell the backend who we are and what role we're claiming.
      const profile = await loginUser(role);
      setUser(profile);
      return profile;
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const code = (e as any)?.code;
      let message = e instanceof Error ? e.message : 'Sign-in failed.';
      if (code === statusCodes.SIGN_IN_CANCELLED) {
        message = 'Sign-in was cancelled.';
      } else if (code === statusCodes.IN_PROGRESS) {
        message = 'Sign-in is already in progress.';
      } else if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        message = 'Google Play Services is not available on this device.';
      }
      setSignInError(message);
      return null;
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    setSigningIn(true);
    try {
      try {
        await GoogleSignin.signOut();
      } catch {
        // ignore
      }
      await auth().signOut();
      setUser(null);
      setFirebaseUser(null);
    } finally {
      setSigningIn(false);
    }
  }, []);

  const refreshUser = useCallback(async (): Promise<void> => {
    if (!auth().currentUser) {
      setUser(null);
      return;
    }
    try {
      const profile = await getMe();
      setUser(profile);
    } catch {
      // leave previous value
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      firebaseUser,
      loading,
      signingIn,
      signInError,
      signInWithGoogle,
      signOut,
      refreshUser,
    }),
    [user, firebaseUser, loading, signingIn, signInError, signInWithGoogle, signOut, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return ctx;
}
