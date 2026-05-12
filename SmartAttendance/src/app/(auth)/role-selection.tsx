import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Role } from '@/types';

interface RoleCardProps {
  role: Role;
  title: string;
  description: string;
  icon: string;
  accent: string;
  onPress: () => void;
}

function RoleCard({ title, description, icon, accent, onPress }: RoleCardProps): JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: 'rgba(255,255,255,0.08)' }}
      className="rounded-2xl mb-4 active:opacity-80"
      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}
    >
      <View className={`rounded-2xl p-6 ${accent}`}>
        <View className="flex-row items-center">
          <View className="w-14 h-14 rounded-2xl bg-white/15 items-center justify-center">
            <Text className="text-3xl">{icon}</Text>
          </View>
          <View className="flex-1 ml-4">
            <Text className="text-white text-xl font-bold">{title}</Text>
            <Text className="text-white/80 text-sm mt-1">{description}</Text>
          </View>
          <Text className="text-white/70 text-2xl">→</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function RoleSelection(): JSX.Element {
  const router = useRouter();

  const go = (role: Role) => {
    router.push({ pathname: '/(auth)/login', params: { role } });
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      {/* subtle gradient background via overlapping views */}
      <View className="absolute top-0 left-0 right-0 h-72 bg-indigo-900/40" />
      <View className="absolute top-32 -right-20 w-72 h-72 rounded-full bg-fuchsia-700/20" />
      <View className="absolute -top-10 -left-20 w-72 h-72 rounded-full bg-sky-700/20" />

      <View className="flex-1 px-6 pt-10 justify-between">
        <View>
          <View className="items-center mt-12">
            <View className="w-16 h-16 rounded-2xl bg-sky-500 items-center justify-center mb-4">
              <Text className="text-white text-3xl">🎓</Text>
            </View>
            <Text className="text-white text-3xl font-bold">Smart Attendance</Text>
            <Text className="text-slate-400 mt-2 text-center">
              Mark presence with Bluetooth, code, or manually.
            </Text>
          </View>
        </View>

        <View className="mb-12">
          <Text className="text-slate-300 text-base font-semibold mb-3 px-1">
            Choose your role
          </Text>
          <RoleCard
            role="student"
            title="Student"
            description="Join classes and mark your own attendance"
            icon="🎓"
            accent="bg-blue-600"
            onPress={() => go('student')}
          />
          <RoleCard
            role="teacher"
            title="Teacher"
            description="Create courses and run attendance sessions"
            icon="👥"
            accent="bg-teal-600"
            onPress={() => go('teacher')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
