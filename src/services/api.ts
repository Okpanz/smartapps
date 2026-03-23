import axios from 'axios';
import { EXPO_PUBLIC_API_URL } from '@env';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const BASE_URL = EXPO_PUBLIC_API_URL || 'https://api.smartverification.ng/api';
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1500;

const api = axios.create({
    baseURL: BASE_URL,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    },
    timeout: 15000, 
});

console.log('[API] Initialized with Base URL:', api.defaults.baseURL);

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

api.interceptors.response.use(
    (response) => {
        return response;
    },
    async (error) => {
        const config: any = error.config;

        if (error.response) {
            console.error('[API Error]', error.response.status, error.response.data);

            if (error.response.status === 401) {
            }
        } else if (error.request) {
            console.error('[API Error] No response received', error.request);
        } else {
            console.error('[API Error] Request setup failed', error.message);
        }

        const shouldRetry =
            (!error.response || (error.response.status >= 500 && error.response.status < 600)) &&
            config &&
            !config._doNotRetry;

        if (!shouldRetry) {
            return Promise.reject(error);
        }

        config._retryCount = (config._retryCount || 0) + 1;

        if (config._retryCount > MAX_RETRIES) {
            return Promise.reject(error);
        }

        const delay = RETRY_BASE_DELAY_MS * config._retryCount;

        await new Promise((resolve) => setTimeout(resolve, delay));
        return api(config);
    }
);

export default api;
