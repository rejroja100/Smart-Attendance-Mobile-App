// We need `react-native-worklets` installed so babel-preset-expo can find its
// plugin during bundling, but we don't want the native module to be linked
// into the APK because its Gradle assertion rejects React Native 0.74.
// Our app never calls any Reanimated/worklets APIs at runtime, so leaving
// the native side out is safe.
module.exports = {
  dependencies: {
    'react-native-worklets': {
      platforms: {
        android: null,
        ios: null,
      },
    },
  },
};
