import React from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { LoadingScreen } from '@/components/LoadingScreen';

export default function Index(): JSX.Element {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingScreen message="Loading…" />;
  }

  if (!user) {
    return <Redirect href="/(auth)/role-selection" />;
  }

  if (user.role === 'teacher') {
    return <Redirect href="/(teacher)" />;
  }

  return <Redirect href="/(student)" />;
}
