import { GoogleGenerativeAI } from "@google/generative-ai";
import { EXPO_PUBLIC_GEMINI_API_KEY } from "@env";

const API_KEY = EXPO_PUBLIC_GEMINI_API_KEY || "AIzaSyBV7yRcM_xaWeXOhZ3df7NWbKZn2DcKDLY";

if (!API_KEY) {
  console.warn(
    "Gemini API Key is missing. Please set EXPO_PUBLIC_GEMINI_API_KEY in your .env file."
  );
}

const genAI = new GoogleGenerativeAI(API_KEY);

const MODEL_NAME = "gemini-2.5-flash";

// System instructions to customize AI for Smart Verify app
const SYSTEM_INSTRUCTION = `You are the intelligent AI assistant for **Smart Verification**, a secure biometric identity enrollment application. Your goal is to help users navigate the app, understand workflows, and troubleshoot issues effectively.

**APP OVERVIEW & FLOWS:**

1.  **Authentication & Security:**
    *   **Login:** Users can log in via **Email/Password** or **Biometrics** (FaceID/Fingerprint).
    *   **Biometric Login:** Can be enabled/disabled in **Settings > Security**. If enabled, the app auto-prompts on startup.
    *   **Session:** Users are kept logged in securely. Logout is available in Settings.

2.  **Dashboard (Home):**
    *   **Statistics:** Displays real-time counts for **Total Enrollments**, **Verified Users**, **Pending Verifications**, and **This Month's Activity**.
    *   **Quick Actions:** Access to "New Enrollment", "Verify Identity", "Scan Document", and "History".

3.  **Enrollment Process (Core Feature):**
    *   **Step 1: Identification:** Users search for an employee (by ID or Name) to verify their existence in the system.
    *   **Step 2: Biometrics:**
        *   **Face Capture:** Takes a secure selfie for facial recognition.
        *   **Fingerprint:** Captures fingerprint data (simulated or via hardware scanner).
    *   **Step 3: Documents:** Users scan physical ID documents using the device camera (supports OCR/Cropping).
    *   **Step 4: Submission:** All data (images, prints, docs, metadata) is uploaded securely to the backend.

4.  **Verification & Sync:**
    *   **Employee Sync:** The app syncs employee data from the backend to local storage for offline search capabilities.
    *   **Fallback:** If the backend is unreachable or empty, the app intelligently uses cached or fallback data to allow testing/demo flows.

5.  **Settings:**
    *   **Profile:** View-only User Profile (Name, Email). *Note: Profile details are managed by Admins and cannot be edited here.*
    *   **Security:** Change Password and toggle **Biometric Login**.

**YOUR ROLE & BEHAVIOR:**
*   **Guide:** Walk users through the enrollment steps if they are stuck.
*   **Troubleshoot:** If a user mentions "sync failed" or "login error", suggest checking internet connection or trying the specific fallback actions (e.g., "Check Settings > Security for Biometrics").
*   **Explain:** Clarify what data is being collected (Face, Fingerprint, Docs) and why (Identity Verification).
*   **Tone:** Professional, Secure, Helpful, and Concise.
*   **Privacy:** Reassure users that data is encrypted and stored securely.

**TECHNICAL CONTEXT (Internal Knowledge):**
*   The app communicates with a **Node.js/Express Backend**.
*   Database: Hybrid **MongoDB** (Biometrics/Logs) + **SQLite** (User Data).
*   Images/Docs are uploaded via **FormData**.
*   **Android Emulator Networking:** The app uses 'http://localhost:8080' (with 'adb reverse tcp:8080 tcp:80') or '10.0.2.2' to communicate with the host. If sync fails, check 'adb reverse' settings.

If a user asks about a feature not listed here, politely inform them it may not be available in the current version (v1.1 Local Server).`;

export interface ChatMessage {
  role: "user" | "model";
  parts: { text: string }[];
}

export const sendMessageToGemini = async (
  message: string,
  history: ChatMessage[] = []
) => {
  // Initial check moved inside try block for better error handling
  try {
    // Clean history
    const filteredHistory = history.filter((msg, i) => {
      if (i === 0 && msg.role !== "user") return false;
      return true;
    });

    // Remove consecutive duplicate roles and ensure starting with user
    const cleanedHistory = [];
    for (const msg of filteredHistory) {
      if (cleanedHistory.length === 0) {
        if (msg.role === "user") cleanedHistory.push(msg);
      } else if (cleanedHistory[cleanedHistory.length - 1].role !== msg.role) {
        cleanedHistory.push(msg);
      }
    }

  console.log("Gemini Service - API Key Check:", { 
    exists: !!API_KEY, 
    length: API_KEY?.length, 
    isPlaceholder: API_KEY?.includes('your_api_key_here') 
  });

  if (!API_KEY || API_KEY.length < 10 || API_KEY.includes('your_api_key_here')) {
    console.warn("Invalid or missing API Key. Switching to Demo Mode.");
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    return "I'm currently in Demo Mode because a valid Gemini API key hasn't been configured. To enable real AI chat, please add your API key to the .env file.\n\nIn the meantime, I can tell you that Smart Verify uses advanced biometric security to protect your identity!";
  }

    // Use updated model name with system instructions
    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      systemInstruction: SYSTEM_INSTRUCTION,
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.7,
      }
    });

    // If no history, use single message
    if (cleanedHistory.length === 0) {
      const result = await model.generateContent(message);
      const response = await result.response;
      return response.text();
    }

    // Start chat with history
    const chat = model.startChat({
      history: cleanedHistory,
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.7,
      },
    });

    const result = await chat.sendMessage(message);
    const response = await result.response;
    return response.text();

  } catch (err: any) {
    // Attempt to extract detailed error info
    const errorDetail = err.message || "Unknown error";
    const statusCode = err.status || err.response?.status;

    console.error("----- GEMINI DIAGNOSTICS -----");
    console.error("Error Message:", errorDetail);
    console.error("Status Code:", statusCode);
    if (err.stack) console.error("Stack Trace:", err.stack);
    console.error("------------------------------");

    // Provide more specific error messages
    if (errorDetail.includes("location is not supported")) {
      return "Gemini is not supported in your current region. Please حاول again using a supported location/VPN.";
    }

    if (errorDetail.includes("model not found") || errorDetail.includes("404")) {
      return "Model not found. The current model 'gemini-2.5-flash' may not be available in your region.";
    }

    if (errorDetail.includes("API key") || statusCode === 401 || statusCode === 403) {
      return "API Key issue. Please check your .env settings.";
    }

    if (errorDetail.includes("Safety") || errorDetail.includes("HARM_CATEGORY")) {
      return "Response blocked by safety filters.";
    }

    return `Connection Error (${statusCode || 'Fetch'}). Please try again.`;
  }
};
