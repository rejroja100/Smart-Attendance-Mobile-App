import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import { ErrorMessage } from '@/components/ErrorMessage';
import type { Role } from '@/types';

export default function Login(): JSX.Element {
  const router = useRouter();
  const { role: rawRole } = useLocalSearchParams<{ role?: string }>();
  const role: Role = rawRole === 'teacher' ? 'teacher' : 'student';
  const { signInWithGoogle, signingIn, signInError } = useAuth();

  const handleSignIn = async () => {
    const profile = await signInWithGoogle(role);
    if (profile) {
      // The root index will redirect on next render; do an explicit replace too.
      router.replace(profile.role === 'teacher' ? '/(teacher)' : '/(student)');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <View className="px-6 pt-2">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full bg-slate-800 items-center justify-center active:opacity-80"
        >
          <Text className="text-white text-lg">←</Text>
        </Pressable>
      </View>

      <View className="flex-1 px-6 justify-center">
        <View className="items-center mb-8">
          <View
            className={`px-3 py-1.5 rounded-full ${
              role === 'teacher' ? 'bg-teal-600/20' : 'bg-blue-600/20'
            }`}
          >
            <Text
              className={`text-xs font-semibold uppercase tracking-widest ${
                role === 'teacher' ? 'text-teal-300' : 'text-blue-300'
              }`}
            >
              Signing in as {role}
            </Text>
          </View>
          <Text className="text-white text-3xl font-bold mt-6">Welcome</Text>
          <Text className="text-slate-400 text-center mt-2">
            Sign in with your Google account to continue.
          </Text>
        </View>

        <Pressable
          onPress={handleSignIn}
          disabled={signingIn}
          className={`flex-row items-center justify-center bg-white rounded-2xl py-4 px-5 ${
            signingIn ? 'opacity-60' : 'active:opacity-90'
          }`}
        >
          {signingIn ? (
            <ActivityIndicator color="#0f172a" />
          ) : (
            <View className="w-6 h-6 rounded-full bg-white items-center justify-center mr-3">
              <Text style={{ fontWeight: 'bold', fontSize: 16 }}>
                <Text style={{ color: '#4285F4' }}>G</Text>
              </Text>
            </View>
          )}
          <Text className="text-slate-900 font-semibold text-base">
            {signingIn ? 'Signing in…' : 'Continue with Google'}
          </Text>
        </Pressable>

        <ErrorMessage message={signInError} />

        <Text className="text-slate-500 text-xs text-center mt-8">
          By continuing you agree to our Terms and Privacy Policy.
        </Text>
      </View>
    </SafeAreaView>
  );
}
