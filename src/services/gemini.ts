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
const SYSTEM_INSTRUCTION = `You are a helpful AI assistant for Smart Verify, a secure biometric identity enrollment application.

**About Smart Verify:**
Smart Verify is a mobile application designed to securely enroll and verify user identities using biometric data including:
- Facial recognition
- Personal information verification

**Your Role:**
- Help users with the identity enrollment process
- Answer questions about biometric data collection
- Explain security and privacy features
- Guide users through face capture steps
- Troubleshoot common enrollment issues
- Provide friendly, professional support

**Key Features to Explain:**
1. **Secure Enrollment**: Multi-step identity verification process
2. **Biometric Capture**: Facial recognition technology
3. **Data Privacy**: All biometric data is encrypted and stored securely
4. **User-Friendly**: Step-by-step guidance through the enrollment process

**Tone & Style:**
- Be friendly, professional, and reassuring
- Use simple, clear language
- Be patient and helpful
- Emphasize security and privacy
- Keep responses concise but informative

**Common Topics:**
- How to position face for facial recognition
- Why biometric data is needed
- Security and privacy of user data
- Steps in the enrollment process
- Troubleshooting capture issues`;

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
