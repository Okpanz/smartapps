import { externalScanner } from '../src/services/externalScanner';

/**
 * Diagnostic script to verify the external scanner service.
 * Note: This must be run within the React Native environment (e.g., via a debug screen or temporary import).
 */
export async function runScannerDiagnostics() {
    console.log("--- Starting External Scanner Diagnostics ---");

    // 1. Check if scanner service is available
    if (!externalScanner) {
        console.error("FAIL: externalScanner service is not exported correctly.");
        return;
    }
    console.log("PASS: externalScanner service is available.");

    // 2. Check Native Module availability
    const status = externalScanner.getStatus();
    console.log(`Current Status: ${status}`);

    // 3. Try to list devices
    try {
        console.log("Searching for USB devices...");
        const devices = await externalScanner.getDevices();
        console.log(`Found ${devices.length} devices.`);
        devices.forEach((d, i) => {
            console.log(` Device ${i + 1}: ${d.product || d.deviceName} (Vendor: ${d.vendorId}, Product: ${d.productId})`);
        });

        if (devices.length === 0) {
            console.warn("WARN: No USB devices found. Ensure the scanner is plugged in and OTG is enabled.");
        } else {
            console.log("PASS: Device discovery is working.");
        }
    } catch (e) {
        console.error("FAIL: Device discovery failed.", e);
    }

    // 4. Connection Test (Manual trigger required in UI, but we log the capability)
    console.log("Instruction: To verify connection, use the 'Connect' button in the app and check for the USB Permission dialog.");

    console.log("--- Diagnostics Complete ---");
}
