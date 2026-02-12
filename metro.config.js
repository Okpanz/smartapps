const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { withNativeWind } = require('nativewind/metro');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = getDefaultConfig(__dirname);

// Disable Watchman due to permission issues
config.resolver.useWatchman = false;

config.watchFolders = [
    require('path').resolve(__dirname, '..', 'i-am-alive')
];

module.exports = withNativeWind(config, { input: './src/global.css' });
