
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

const https = require('https');

async function listModels() {
    if (!API_KEY) {
        console.error("API Key is missing in .env");
        return;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;

    https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
            const parsed = JSON.parse(data);
            if (parsed.error) {
                console.error("API Error:", parsed.error.message);
                return;
            }
            console.log("Available Models:");
            parsed.models.forEach(m => {
                console.log(`- ${m.name}`);
            });
        });
    }).on('error', (err) => {
        console.error("Error listing models:", err.message);
    });
}

listModels();
