import { useAuthContext } from '@/context/AuthContext';

// Re-export the auth context hook so screens can `import { useAuth } from '@/hooks/useAuth'`.
export function useAuth() {
  return useAuthContext();
}
