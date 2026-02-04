import axios from 'axios';
import { EXPO_PUBLIC_API_URL } from '@env';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Create axios instance with base configuration
const BASE_URL = EXPO_PUBLIC_API_URL || 'https://smart-verify-server.onrender.com/api';

const api = axios.create({
    baseURL: BASE_URL,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    },
    timeout: 15000, 
});

console.log('[API] Initialized with Base URL:', api.defaults.baseURL);

// Request interceptor
api.interceptors.request.use(
    async (config) => {
        const token = await AsyncStorage.getItem('userToken');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor
api.interceptors.response.use(
    (response) => {
        return response;
    },
    async (error) => {
        if (error.response) {
            console.error('[API Error]', error.response.status, error.response.data);
            
            if (error.response.status === 401) {
            }
        } else if (error.request) {
            console.error('[API Error] No response received', error.request);
        } else {
            console.error('[API Error] Request setup failed', error.message);
        }
        return Promise.reject(error);
    }
);

export default api;
