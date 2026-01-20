#!/bin/bash

echo "🚀 Setting up Real-Time Face Detection"
echo "======================================"

echo "📦 Installing required dependencies..."
npm install react-native-worklets-core

echo "🔧 Building development client with EAS..."
echo "This will take several minutes..."

eas build --profile development --platform android --non-interactive

echo "✅ Build complete!"
echo ""
echo "📱 Next steps:"
echo "1. Download and install the development build on your device"
echo "2. Update your face screen import to use 'face-advanced'"
echo "3. Run: npx expo start --dev-client"
echo "4. Scan QR code with your development build"
echo ""
echo "🎯 You'll then have real-time face detection with:"
echo "   - Live face count display"
echo "   - Face boundary visualization"
echo "   - Smart capture (only when 1 face detected)"
echo "   - Face angle detection"