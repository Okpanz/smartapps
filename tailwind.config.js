/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./App.{js,jsx,ts,tsx}",
        "./app/**/*.{js,jsx,ts,tsx}",
        "./components/**/*.{js,jsx,ts,tsx}",
        "./src/**/*.{js,jsx,ts,tsx}",
        "../i-am-alive/src/**/*.{js,jsx,ts,tsx}",
    ],

    // ✅ REQUIRED FOR NATIVEWIND
    presets: [require("nativewind/preset")],

    theme: {
        extend: {
            colors: {
                primary: {
                    DEFAULT: "#02542D", // Deep Forest Green
                    light: "#006C4C",
                    dark: "#002114",
                },
                secondary: "#10B981", // Emerald
                accent: "#FBBF24", // Amber
                background: "#F8FAFC", // Slate-50
                card: "#FFFFFF",
                outline: "#E2E8F0", // Slate-200
            },
            borderRadius: {
                "3xl": "24px",
            },
        },
    },

    plugins: [],
};
