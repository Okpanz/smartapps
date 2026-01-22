module.exports = {
    presets: ['module:@react-native/babel-preset', 'nativewind/babel'],
    plugins: [
        '@babel/plugin-transform-export-namespace-from',
        'react-native-worklets-core/plugin',
        'react-native-reanimated/plugin',
    ],
};
