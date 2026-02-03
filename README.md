# SmartApps (Mobile)

The official React Native mobile application for Smart Verify, supporting biometric enrollment (face/fingerprint) and offline data synchronization.

## Prerequisites

- **Node.js**: v18 or higher.
- **JDK**: JDK 17 is recommended (compatible with AGP 8).
- **Android Studio**: Required for Android development (SDK, Emulators).
- **Xcode**: Required for iOS development (macOS only).
- **Watchman**: Recommended for better file watching performance (`brew install watchman`).

## Installation

1.  Navigate to the project directory:
    ```bash
    cd smartapps
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```
    *Note: This project uses `patch-package` to fix compatibility issues in some native libraries. It runs automatically after install.*

## Environment Setup

The app connects to the backend services. Ensure you have the following services running:
1.  **Smart Verify Server** (Node.js) on port `7001`.
2.  **Legacy Backend** (Laravel) on port `8000` (proxied via Node.js server).

## Running the App

### Start Metro Bundler
Start the JavaScript bundler in a separate terminal:
```bash
npm start
```
*Use `npm run reset` to start with a cleared cache if you encounter issues.*

### Android

1.  **Connect Device/Emulator**:
    Ensure your device is connected via USB or an emulator is running.
    ```bash
    adb devices
    ```

2.  **Run on Android**:
    ```bash
    npm run android
    ```
    *Or for a specific device:*
    ```bash
    npx react-native run-android --deviceId <your_device_id>
    ```

### iOS (macOS only)

1.  **Install Pods**:
    ```bash
    cd ios && pod install && cd ..
    ```

2.  **Run on iOS**:
    ```bash
    npm run ios
    ```

## Wireless Debugging (Android)

To debug wirelessly on a physical Android device:

1.  Connect via ADB (ensure device and computer are on the same Wi-Fi).
2.  Run the following to forward the Metro bundler port:
    ```bash
    adb -s <device_id> reverse tcp:8081 tcp:8081
    ```
3.  To allow the app to talk to the local backend (localhost:7001):
    ```bash
    adb -s <device_id> reverse tcp:7001 tcp:7001
    ```

## Troubleshooting

- **Build Failures**:
    - Clean the Android build folder:
      ```bash
      npm run clean
      ```
    - Ensure `local.properties` in `android/` has the correct `sdk.dir`.

- **Metro Connection Issues**:
    - Run `adb reverse tcp:8081 tcp:8081`.
    - Shake the device to open the developer menu and check "Settings" > "Debug server host & port".

- **Native Module Errors**:
    - Try deleting `node_modules` and running `npm install` again to ensure patches are applied.
