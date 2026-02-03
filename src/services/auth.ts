import api from './api';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { databaseService } from './database';

export interface User {
    id: string;
    username: string;
    name: string;
    email?: string;
    role?: string;
    service_id?: number;
    [key: string]: any;
}

interface LoginResponse {
    success: boolean;
    message: string;
    statusCode: number;
    data: any;
}

export const login = async (username: string, password: string): Promise<User> => {
    console.log(`Logging in with ${username} to ${api.defaults.baseURL}`);
    try {
        const response = await api.post<LoginResponse>('/auth/sign-in', {
            email: username,
            password
        });

        console.log('Login Response:', JSON.stringify(response.data, null, 2));

        if (response.data.success && response.data.data && response.data.data.token) {
            const { token, user } = response.data.data;

            // Store token for subsequent requests
            await AsyncStorage.setItem('userToken', token);
            
            const { id, ...rest } = user;
            const userData = {
                ...rest,
                id: String(id),
                username: user.email,
                name: user.name,
                email: user.email,
            };

            await AsyncStorage.setItem('userData', JSON.stringify(userData));

            return userData;
        }

        console.warn('Login success flag is false or data missing:', response.data);

        let errorMessage = response.data.message || 'Login failed';

        // Extract validation errors if present
        if (response.data.data && typeof response.data.data === 'object') {
            const validationErrors = Object.values(response.data.data)
                .flat()
                .filter(msg => typeof msg === 'string');

            if (validationErrors.length > 0) {
                errorMessage = validationErrors.join('\n');
            }
        }

        throw new Error(errorMessage);
    } catch (error: any) {
        if (error.response) {
            console.error('[Login Error Response]:', error.response.status, JSON.stringify(error.response.data));
            throw new Error(`Login failed: ${error.response.data.message || 'Server error'}`);
        } else if (error.request) {
            console.error('[Login Error Request]: No response received', error.request);
             throw new Error('Login failed: Network error - Could not reach server');
        } else {
            console.error('[Login Error]:', error.message);
            throw error;
        }
    }
};

export const logout = async (): Promise<void> => {
    await AsyncStorage.removeItem('userToken');
    await AsyncStorage.removeItem('userData');
    await AsyncStorage.removeItem('employeesData');
};

export const downloadOfflineRecords = async (
    onProgress?: (count: number) => void,
    serviceId?: string | number
): Promise<number> => {
    try {
        if (!serviceId) {
            throw new Error('Service ID is required for downloading records');
        }

        let hasMore = true;
        let nextCursor: number | null = null;
        
        console.log(`[Offline Sync] Starting download for Service ID: ${serviceId}`);

        let totalSaved = 0;

        while (hasMore) {
            console.log(`[Offline Sync] Fetching batch. Cursor: ${nextCursor}`);
            
            let retries = 3;
            let response: any;
            
            while (retries > 0) {
                try {
                    response = await api.get('/verification/download', { 
                        params: {
                            service_id: serviceId,
                            limit: 200, // Fetch larger batches for efficiency
                            cursor: nextCursor
                        },
                        timeout: 60000 // Increased timeout to 60s for full download
                    });
                    break; // Success, exit retry loop
                } catch (err: any) {
                    const isTimeout = err.code === 'ECONNABORTED';
                    const is504 = err.response && err.response.status === 504;
                    const isNetworkError = err.message === 'Network Error';

                    if (isTimeout || is504 || isNetworkError) {
                        retries--;
                        console.warn(`[Offline Sync] Request failed (Status: ${err.response?.status || err.code}). Retrying... (${3 - retries}/3)`);
                        if (retries === 0) throw err; // Exhausted retries
                        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s
                    } else {
                        throw err; // Other error, throw immediately
                    }
                }
            }

            console.log('[Offline Sync] Response Status:', response.status);

            const data = response.data;
            // Support both Laravel 'status' and Node 'success' formats
            if (data && (data.status || data.success)) {
                // Handle potential data nesting differences
                const responseData = data.data || data;
                const fetchedEmployees = responseData.employees || [];
                
                const pagination = responseData.pagination;
                hasMore = pagination?.has_more || false;
                nextCursor = pagination?.next_cursor;

                if (fetchedEmployees.length > 0) {
                     console.log('[Offline Sync] Downloaded Employees (First 10):');
                     fetchedEmployees.forEach((emp: any, index: number) => {
                         console.log(`${index + 1}. ${emp.fullname} (${emp.employee_number || emp.id}) - ${emp.designation || 'No Designation'}`);
                     });

                     // UPSERT LOGIC: Save to SQLite Database
                     try {
                        console.log(`[Offline Sync] Upserting ${fetchedEmployees.length} records to SQLite...`);
                        await databaseService.upsertEmployees(fetchedEmployees);
                        
                        totalSaved = await databaseService.getCount();
                        console.log(`[Offline Sync] Saved batch of ${fetchedEmployees.length}. Total unique records in DB: ${totalSaved}`);
                        
                     } catch (err: any) {
                         console.error('[Offline Sync] Error saving batch to SQLite:', err.message);
                         throw err;
                     }
                }

                if (onProgress) {
                    onProgress(totalSaved);
                }

                console.log(`[Offline Sync] Batch processed. Has More: ${hasMore}, Next Cursor: ${nextCursor}`);
                
            } else {
                console.warn('[Offline Sync] API returned success=false or invalid format');
                hasMore = false; // Stop on error
            }
        }
        
        console.log(`[Offline Sync] Download complete. Total records in storage: ${totalSaved}`);
        return totalSaved;

    } catch (error: any) {
        console.error('[Offline Sync] Error:', error.message);
        if (error.response) {
            console.error('[Offline Sync] Response Status:', error.response.status);
            console.error('[Offline Sync] Response Data:', JSON.stringify(error.response.data));
        }
        throw error;
    }
};

export const syncEmployees = async (serviceId: string | number = '234070795'): Promise<void> => {
    // WARNING: This function uses hardcoded URLs and connects directly to Laravel (Port 8000).
    // It is currently DEPRECATED in favor of downloadOfflineRecords which uses the Node proxy.
    // Ensure you really want to use this before uncommenting/calling it.
    try {
        // Handle Android Emulator networking for local domains
        let baseURL = 'http://127.0.0.1:8000';
        const headers: any = {
            'Accept': 'application/json'
        };

        if (Platform.OS === 'android') {
            // Android Emulator Loopback IP (accesses host machine localhost)
            baseURL = 'http://10.0.2.2:8000';
        }

        const url = `${baseURL}/api/mobile/v1/employees?service_id=234070795`;
        console.log(`[Sync] Fetching employees from ${url}`);

        const response = await axios.get(url, { headers });

        if (response.data && response.data.status) {
            const employeeCount = response.data.data?.employees?.length || 0;
            console.log('[Sync] Employees fetched successfully. Count:', employeeCount);

            if (employeeCount === 0) {
                console.warn('[Sync] API returned 0 employees. Forcing fallback dummy data for testing.');
                // Use fallback data
                const dummyData = {
                    employees: [
                        {
                            employee_number: "EMP001",
                            employment_number: "EMP001",
                            fullname: "John Doe",
                            account_number: "1234567890",
                            department: "Engineering",
                            phone_number: "08012345678",
                            email: "john.doe@example.com"
                        },
                        {
                            employee_number: "EMP002",
                            employment_number: "EMP002",
                            fullname: "Jane Smith",
                            account_number: "0987654321",
                            department: "Human Resources",
                            phone_number: "08087654321",
                            email: "jane.smith@example.com"
                        },
                        {
                            employee_number: "ADMIN001",
                            employment_number: "ADMIN001",
                            fullname: "System Admin",
                            account_number: "0000000000",
                            department: "IT",
                            phone_number: "08000000000",
                            email: "okpanz@admin.com"
                        }
                    ]
                };
                // await AsyncStorage.setItem('employeesData', JSON.stringify(dummyData));
                console.log('[Sync] Fallback dummy data GENERATED but NOT saved (storage disabled).');
            } else {
                // await AsyncStorage.setItem('employeesData', JSON.stringify(response.data.data));
                console.log('[Sync] Live data fetched but NOT saved (storage disabled).');
            }
        } else {
            console.warn('[Sync] Failed to fetch employees:', response.data.message);
        }
    } catch (error: any) {
        console.error('[Sync] Error fetching employees:', error.message);
        if (error.response) {
            console.error('[Sync] Response Status:', error.response.status);
            console.error('[Sync] Response Data:', JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            console.error('[Sync] No response received. Request details:', error.request);
        } else {
            console.error('[Sync] Request setup error:', error.message);
        }

        console.warn('[Sync] Using fallback dummy data due to API failure.');
        // DEBUG LOGGING
        console.log('[Sync] Preparing fallback data...');
        const dummyData = {
            employees: [
                {
                    employee_number: "EMP001",
                    employment_number: "EMP001",
                    fullname: "John Doe",
                    account_number: "1234567890",
                    department: "Engineering",
                    phone_number: "08012345678",
                    email: "john.doe@example.com"
                },
                {
                    employee_number: "EMP002",
                    employment_number: "EMP002",
                    fullname: "Jane Smith",
                    account_number: "0987654321",
                    department: "Human Resources",
                    phone_number: "08087654321",
                    email: "jane.smith@example.com"
                },
                {
                    employee_number: "ADMIN001",
                    employment_number: "ADMIN001",
                    fullname: "System Admin",
                    account_number: "0000000000",
                    department: "IT",
                    phone_number: "08000000000",
                    email: "okpanz@admin.com"
                }
            ]
        };
        // await AsyncStorage.setItem('employeesData', JSON.stringify(dummyData));
        console.log('[Sync] Fallback dummy data GENERATED but NOT saved (storage disabled).');
    }
};

export const updateProfile = async (data: any): Promise<any> => {
    try {
        const response = await api.put('/auth/profile', data);
        if (response.data && response.data.success) {
            return response.data.data;
        }
        throw new Error(response.data.message || 'Profile update failed');
    } catch (error: any) {
        console.error('[AuthService] Update Profile Error:', error);
        throw error;
    }
};

export const changePassword = async (data: any): Promise<boolean> => {
    try {
        const response = await api.post('/auth/change-password', data);
        if (response.data && response.data.success) {
            return true;
        }
        throw new Error(response.data.message || 'Password change failed');
    } catch (error: any) {
        console.error('[AuthService] Change Password Error:', error);
        throw error;
    }
};

export const createAdhockStaff = async (userData: any): Promise<any> => {
    try {
        const response = await api.post('/auth/create-adhock-staff', userData);
        if (response.data && response.data.success) {
            return response.data.data;
        }
        throw new Error(response.data.message || 'Failed to create adhock staff');
    } catch (error: any) {
        console.error('[AuthService] Create Adhock Staff Error:', error);
        if (error.response && error.response.data && error.response.data.message) {
             throw new Error(error.response.data.message);
        }
        throw error;
    }
};
