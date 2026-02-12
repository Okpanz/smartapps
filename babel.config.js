module.exports = {
    presets: ['module:@react-native/babel-preset', 'nativewind/babel'],
    plugins: [
        ['module:react-native-dotenv', {
            "moduleName": "@env",
            "path": ".env",
            "blocklist": null,
            "allowlist": null,
            "blacklist": null, // DEPRECATED
            "whitelist": null, // DEPRECATED
            "safe": false,
            "allowUndefined": true,
            "verbose": false
        }],
        [
            'module-resolver',
            {
                root: ['./src'],
                extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
                alias: {
                    '@i-am-alive': '../i-am-alive/src',
                },
            },
        ],
        '@babel/plugin-transform-export-namespace-from',
        'react-native-worklets-core/plugin',
        'react-native-reanimated/plugin',
    ],
};
