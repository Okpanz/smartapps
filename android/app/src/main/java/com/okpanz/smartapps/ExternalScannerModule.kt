package com.okpanz.smartappsv2

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

import android.util.Base64
import com.zkteco.android.biometric.core.device.ParameterHelper
import com.zkteco.android.biometric.core.device.TransportType
import com.zkteco.android.biometric.core.utils.LogHelper
import com.zkteco.android.biometric.module.fingerprintreader.FingerprintCaptureListener
import com.zkteco.android.biometric.module.fingerprintreader.FingerprintSensor
import com.zkteco.android.biometric.module.fingerprintreader.exception.FingerprintException
import android.graphics.Bitmap
import java.io.ByteArrayOutputStream

class ExternalScannerModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val ACTION_USB_PERMISSION = "com.okpanz.smartappsv2.USB_PERMISSION"
    private val usbManager: UsbManager = reactContext.getSystemService(Context.USB_SERVICE) as UsbManager
    private var pendingIntent: PendingIntent? = null
    
    private var fingerprintSensor: FingerprintSensor? = null
    private var isScanning = false

    init {
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        val intent = Intent(ACTION_USB_PERMISSION)
        intent.setPackage(reactContext.packageName)
        pendingIntent = PendingIntent.getBroadcast(reactContext, 0, intent, flags)
        
        registerUsbReceiver()
    }

    override fun getName(): String {
        return "ExternalScanner"
    }

    private fun registerUsbReceiver() {
        val filter = IntentFilter(ACTION_USB_PERMISSION)
        filter.addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED)
        filter.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED)
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            reactApplicationContext.registerReceiver(usbReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            reactApplicationContext.registerReceiver(usbReceiver, filter)
        }
    }

    private val usbReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val action = intent.action
            if (ACTION_USB_PERMISSION == action) {
                synchronized(this) {
                    val device: UsbDevice? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
                    } else {
                        @Suppress("DEPRECATION")
                        intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
                    }

                    if (intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)) {
                        device?.let {
                            // Log.d("ExternalScanner", "Permission granted for device ${it.deviceName}")
                            sendEvent("onUsbPermissionGranted", "Permission granted")
                            logToJs("Permission granted for device ${it.deviceName}", "success")
                            initSensor()
                        }
                    } else {
                        // Log.d("ExternalScanner", "Permission denied for device $device")
                        sendEvent("onUsbPermissionDenied", "Permission denied")
                        logToJs("Permission denied", "error")
                    }
                }
            } else if (UsbManager.ACTION_USB_DEVICE_ATTACHED == action) {
                 sendEvent("onDeviceAttached", "Device attached")
                 logToJs("Device attached", "info")
            } else if (UsbManager.ACTION_USB_DEVICE_DETACHED == action) {
                 sendEvent("onDeviceDetached", "Device detached")
                 logToJs("Device detached", "info")
                 closeSensor()
            }
        }
    }

    private fun sendEvent(eventName: String, params: Any?) {
        if (reactApplicationContext.hasActiveReactInstance()) {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        }
    }

    private fun logToJs(message: String, type: String) {
        val params = Arguments.createMap()
        params.putString("message", message)
        params.putString("type", type)
        sendEvent("onScannerMessage", params)
    }

    private fun initSensor() {
        if (fingerprintSensor == null) {
            val params = java.util.HashMap<String, Any>()
            
            // Try to find ZK device
            val deviceList = usbManager.deviceList
            var foundDevice: UsbDevice? = null
            
            for (device in deviceList.values) {
                // ZKTeco VID is usually 6997 (0x1b55)
                if (device.vendorId == 6997 || device.vendorId == 0x1b55) {
                    foundDevice = device
                    break
                }
            }
            
            // Fallback to first device if specific ZK device not found
            if (foundDevice == null && !deviceList.isEmpty()) {
                foundDevice = deviceList.values.first()
            }
            
            if (foundDevice != null) {
                // Log.d("ExternalScanner", "Init sensor with device: ${foundDevice.deviceName} VID=${foundDevice.vendorId} PID=${foundDevice.productId}")
                logToJs("Initializing sensor: ${foundDevice.deviceName}", "info")
                params[ParameterHelper.PARAM_KEY_VID] = foundDevice.vendorId
                params[ParameterHelper.PARAM_KEY_PID] = foundDevice.productId
            } else {
                // Log.w("ExternalScanner", "No USB device found for initSensor")
                logToJs("No USB device found", "warning")
                // Defaults to avoid NPE
                params[ParameterHelper.PARAM_KEY_VID] = 6997
                params[ParameterHelper.PARAM_KEY_PID] = 288
            }

            fingerprintSensor = FingerprintSensor(reactApplicationContext, TransportType.USB, params)
        }
    }

    private fun closeSensor() {
        try {
            if (isScanning) {
                fingerprintSensor?.stopCapture(0)
                isScanning = false
            }
            fingerprintSensor?.close(0)
            fingerprintSensor?.destroy()
            fingerprintSensor = null
        } catch (e: Exception) {
            // Log.e("ExternalScanner", "Error closing sensor", e)
            logToJs("Error closing sensor: ${e.message}", "error")
        }
    }

    @ReactMethod
    fun startScan(promise: Promise) {
        try {
            initSensor()
            
            fingerprintSensor?.setFingerprintCaptureListener(0, object : FingerprintCaptureListener {
                override fun captureError(e: FingerprintException) {
                    // Only report error if we are still intending to scan
                    if (isScanning) {
                        // Log.e("ExternalScanner", "Capture error: ${e.message}")
                        sendEvent("onCaptureError", e.message)
                        // logToJs("Capture error: ${e.message}", "error")
                    }
                }

                override fun captureOK(fpImage: ByteArray) {
                    if (!isScanning) return
                    try {
                        val width = fingerprintSensor!!.imageWidth
                        val height = fingerprintSensor!!.imageHeight
                        
                        // Convert raw grayscale bytes to Bitmap
                        val bits = IntArray(width * height)
                        for (i in 0 until width * height) {
                            // Ensure we don't go out of bounds if fpImage is smaller
                            if (i >= fpImage.size) break
                            val pixel = fpImage[i].toInt() and 0xff
                            bits[i] = android.graphics.Color.rgb(pixel, pixel, pixel)
                        }
                        
                        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                        bitmap.setPixels(bits, 0, width, 0, 0, width, height)
                        
                        // Convert Bitmap to Base64 JPEG
                        val outputStream = ByteArrayOutputStream()
                        bitmap.compress(Bitmap.CompressFormat.JPEG, 100, outputStream)
                        val base64Image = Base64.encodeToString(outputStream.toByteArray(), Base64.NO_WRAP)
                        
                        sendEvent("onImageReceived", base64Image)
                        // logToJs("Image captured", "success") // Optional
                        
                    } catch (e: Exception) {
                        // Log.e("ExternalScanner", "Error processing image", e)
                        logToJs("Error processing image: ${e.message}", "error")
                    }
                }

                override fun extractOK(fpTemplate: ByteArray) {
                     // Template extraction successful
                     val base64Template = Base64.encodeToString(fpTemplate, Base64.NO_WRAP)
                     sendEvent("onTemplateReceived", base64Template)
                }

                override fun extractError(e: Int) {
                    // Log.e("ExternalScanner", "Extract error: $e")
                    logToJs("Extract error: $e", "error")
                }
            })

            fingerprintSensor?.open(0)
            fingerprintSensor?.startCapture(0)
            isScanning = true
            
            // Log.d("ExternalScanner", "Capture started")
            logToJs("Capture started", "info")
            promise.resolve("Scanning Started")

        } catch (e: Exception) {
            // Log.e("ExternalScanner", "Start capture failed", e)
            logToJs("Start capture failed: ${e.message}", "error")
            promise.reject("CAPTURE_FAILED", e.message)
            closeSensor()
        }
    }

    @ReactMethod
    fun stopScan(promise: Promise) {
        try {
            if (isScanning) {
                isScanning = false
                fingerprintSensor?.stopCapture(0)
            }
            promise.resolve("Scanning Stopped")
        } catch (e: Exception) {
            promise.reject("STOP_FAILED", e.message)
        }
    }

    // Deprecated: Kept for backward compatibility if needed, but redirects to startScan
    @ReactMethod
    fun capture(promise: Promise) {
        startScan(promise)
    }

    @ReactMethod
    fun getDeviceList(promise: Promise) {
        val deviceList = usbManager.deviceList
        val devicesArray = Arguments.createArray()
        
        for (device in deviceList.values) {
            val map = Arguments.createMap()
            map.putString("deviceName", device.deviceName)
            map.putInt("vendorId", device.vendorId)
            map.putInt("productId", device.productId)
            map.putInt("deviceId", device.deviceId)
            devicesArray.pushMap(map)
        }
        
        promise.resolve(devicesArray)
    }

    @ReactMethod
    fun requestPermission(deviceId: Int, promise: Promise) {
        val deviceList = usbManager.deviceList
        var targetDevice: UsbDevice? = null
        
        for (device in deviceList.values) {
            if (device.deviceId == deviceId) {
                targetDevice = device
                break
            }
        }
        
        if (targetDevice != null) {
            if (usbManager.hasPermission(targetDevice)) {
                 promise.resolve("Permission already granted")
                 sendEvent("onUsbPermissionGranted", "Permission already granted")
                 logToJs("Permission already granted", "success")
            } else {
                 usbManager.requestPermission(targetDevice, pendingIntent)
                 promise.resolve("Requesting permission")
                 logToJs("Requesting permission...", "info")
            }
        } else {
            promise.reject("DEVICE_NOT_FOUND", "Device with ID $deviceId not found")
            logToJs("Device with ID $deviceId not found", "error")
        }
    }
    
    @ReactMethod
    fun addListener(eventName: String) {
        // Keep: Required for RN built-in Event Emitter Calls.
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Keep: Required for RN built-in Event Emitter Calls.
    }

    @ReactMethod
    fun initSdk(promise: Promise) {
        // Placeholder for SDK init
        promise.resolve(null)
    }
}
