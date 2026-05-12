import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

interface LoadingScreenProps {
  message?: string;
  fullScreen?: boolean;
}

export function LoadingScreen({
  message,
  fullScreen = true,
}: LoadingScreenProps): JSX.Element {
  return (
    <View
      className={`${
        fullScreen ? 'flex-1' : ''
      } items-center justify-center bg-slate-950 py-10`}
    >
      <ActivityIndicator size="large" color="#38bdf8" />
      {message ? (
        <Text className="text-slate-300 mt-4 text-sm">{message}</Text>
      ) : null}
    </View>
  );
}

export default LoadingScreen;
