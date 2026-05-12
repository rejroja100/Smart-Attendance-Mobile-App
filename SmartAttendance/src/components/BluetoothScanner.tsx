import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';

interface BluetoothScannerProps {
  active: boolean;
  label?: string;
  size?: number;
}

export function BluetoothScanner({
  active,
  label = 'Scanning…',
  size = 160,
}: BluetoothScannerProps): JSX.Element {
  const pulses = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  const animations = useRef<Animated.CompositeAnimation[]>([]);

  useEffect(() => {
    if (!active) {
      animations.current.forEach((a) => a.stop());
      pulses.forEach((v) => v.setValue(0));
      return;
    }
    animations.current = pulses.map((value, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 600),
          Animated.timing(value, {
            toValue: 1,
            duration: 1800,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    animations.current.forEach((a) => a.start());
    return () => {
      animations.current.forEach((a) => a.stop());
    };
  }, [active, pulses]);

  return (
    <View className="items-center justify-center" style={{ height: size, width: size }}>
      {active &&
        pulses.map((value, i) => (
          <Animated.View
            key={i}
            className="absolute rounded-full border-2 border-sky-400"
            style={{
              width: size,
              height: size,
              opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
              transform: [
                {
                  scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
                },
              ],
            }}
          />
        ))}
      <View
        className="rounded-full bg-sky-500 items-center justify-center"
        style={{ width: size * 0.4, height: size * 0.4 }}
      >
        <Text className="text-white text-2xl">📡</Text>
      </View>
      <Text className="absolute -bottom-2 text-slate-300 text-xs">
        {active ? label : 'Idle'}
      </Text>
    </View>
  );
}

export default BluetoothScanner;
