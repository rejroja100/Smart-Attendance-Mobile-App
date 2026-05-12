import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

interface ExportButtonProps {
  format: 'xlsx' | 'csv';
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export function ExportButton({
  format,
  onPress,
  loading = false,
  disabled = false,
}: ExportButtonProps): JSX.Element {
  const isExcel = format === 'xlsx';
  const bg = isExcel ? 'bg-emerald-600' : 'bg-sky-600';
  const label = isExcel ? 'Download Excel' : 'Download CSV';
  const icon = isExcel ? '📊' : '📄';
  return (
    <Pressable
      onPress={disabled || loading ? undefined : onPress}
      className={`flex-1 mx-1 rounded-xl py-3 px-4 ${bg} ${
        disabled || loading ? 'opacity-60' : 'active:opacity-80'
      }`}
    >
      <View className="flex-row items-center justify-center">
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-white text-lg mr-2">{icon}</Text>
        )}
        <Text className="text-white font-semibold">
          {loading ? 'Downloading…' : label}
        </Text>
      </View>
    </Pressable>
  );
}

export default ExportButton;
