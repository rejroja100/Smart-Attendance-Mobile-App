import React from 'react';
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { LoadingScreen } from '@/components/LoadingScreen';

export default function StudentLayout(): JSX.Element {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen message="Loading…" />;
  if (!user) return <Redirect href="/(auth)/role-selection" />;
  if (user.role !== 'student') return <Redirect href="/(teacher)" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#020617' },
      }}
    />
  );
}
