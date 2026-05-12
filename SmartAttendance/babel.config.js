module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          jsxImportSource: 'nativewind',
          // Explicitly disable worklets auto-loading so the preset doesn't
          // try to require 'react-native-worklets/plugin'. Our app doesn't
          // use Reanimated worklets, so this is safe.
          worklets: false,
          reanimated: false,
        },
      ],
      'nativewind/babel',
    ],
  };
};
