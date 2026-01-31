import axios from 'axios';
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { databaseService } from './database';

export interface Employee {
    id: string;
    identifier: string;
    firstName: string;
    lastName: string;
    fullname: string;
    accountNumber: string;
    department: string;
}

interface IdentifyResponse {
    status: string;
    message: string;
    code: number;
    data: {
        fullname: string;
        employee_no: string;
        account_number: string;
        department: string;
    };
}

export const verifyIdentifier = async (identifier: string): Promise<Employee> => {
    try {
        console.log(`[Verify] Searching for identifier: ${identifier}`);

        // Check Network Status
        const netState = await NetInfo.fetch();
        // Consider offline if disconnected OR (connected but not reachable)
        // Note: isInternetReachable can be null initially, so we default to true if null (optimistic)
        const isOffline = netState.isConnected === false || (netState.isConnected === true && netState.isInternetReachable === false);

        if (isOffline) {
            return await searchLocalStorage(identifier);
        }

        // 2. Direct API Verification (Online)
        // Target: http://smartpay.test/api/mobile/v1/employees?identifier=...
        console.log('[Verify] Calling Direct API search...');
        
        // Handle Android Emulator networking for local domains
        let baseURL = 'http://smartpay.test';
        const headers: any = {
            'Accept': 'application/json'
        };

        if (Platform.OS === 'android') {
            // Android Emulator Loopback IP (accesses host machine localhost)
            baseURL = 'http://10.0.2.2';
            headers['Host'] = 'smartpay.test';
        }

        const url = `${baseURL}/api/mobile/v1/employees`;
        console.log(`[Verify] Fetching from ${url} with identifier: ${identifier}`);

        try {
            const response = await axios.get<{ status: boolean, message: string, data: any }>(url, {
                params: { identifier },
                headers,
                timeout: 10000 // 10s timeout
            });

            console.log('[Verify] API Response:', JSON.stringify(response.data, null, 2));

            if (response.data && response.data.status && response.data.data) {
                const foundEmployee = response.data.data;
                // ... (existing logic)
                let employeeData: any = null;
                if (foundEmployee.employees && Array.isArray(foundEmployee.employees)) {
                    if (foundEmployee.employees.length > 0) employeeData = foundEmployee.employees[0];
                } else if (Array.isArray(foundEmployee)) {
                    if (foundEmployee.length > 0) employeeData = foundEmployee[0];
                } else {
                    employeeData = foundEmployee;
                }

                if (!employeeData) throw new Error('Employee not found in API response');
                
                console.log('[Verify] Employee found via API:', employeeData.fullname);
                const nameParts = (employeeData.fullname || '').split(' ');
                const firstName = nameParts[0] || '';
                const lastName = nameParts.slice(1).join(' ') || '';

                return {
                    id: employeeData.employee_number || employeeData.employment_number || employeeData.id,
                    identifier: identifier,
                    firstName,
                    lastName,
                    fullname: employeeData.fullname,
                    accountNumber: employeeData.account_number,
                    department: employeeData.department,
                };
            } else {
                throw new Error(response.data?.message || 'Employee not found');
            }
        } catch (error: any) {
            console.warn('[Verify] API request failed, attempting fallback to local storage:', error.message);
            // Fallback to local storage if API fails (network error, timeout, etc)
            // But NOT if API returned 404 (User not found) - actually, standard axios error for 404 might be caught here.
            // If the error is "Network Error" or timeout, definitely fallback.
            // If 404, maybe not? But current API returns 200 with empty data for "not found" usually? 
            // The code above throws 'Employee not found' if data is empty.
            
            // If the error is strictly "Employee not found" (logic error), we shouldn't fallback to local?
            // Actually, if we are "Online" but API says "Not Found", local storage might have it? Unlikely if synced.
            // But if we are "Online" and API is DOWN (500, Network Error), we SHOULD fallback.
            
            if (error.message === 'Employee not found' || error.message === 'Employee not found in API response') {
                throw error; // Propagate "Not Found" if API explicitly said so
            }

            return await searchLocalStorage(identifier);
        }

    } catch (error: any) {
        console.error('Verify Identifier Error:', error.message);
        throw new Error(error.message || 'Verification failed');
    }
};

// Extracted Helper
const searchLocalStorage = async (identifier: string): Promise<Employee> => {
    console.log('[Verify] Offline/Fallback mode. Searching local storage (SQLite)...');
    
    try {
        const results = await databaseService.searchEmployees(identifier);
        
        console.log(`[Verify] Found ${results.length} matches in SQLite.`);
        
        if (results.length > 0) {
            const foundEmployee = results[0];
            console.log('[Verify] Employee found locally:', foundEmployee.fullname);
            
            const nameParts = (foundEmployee.fullname || '').split(' ');
            const firstName = nameParts[0] || '';
            const lastName = nameParts.slice(1).join(' ') || '';

            return {
                id: foundEmployee.employee_number || foundEmployee.employment_number || foundEmployee.id,
                identifier: identifier,
                firstName,
                lastName,
                fullname: foundEmployee.fullname,
                accountNumber: foundEmployee.account_number,
                department: foundEmployee.department,
            };
        } else {
            console.log(`[Verify] No local match found for identifier: ${identifier}`);
            throw new Error('Employee not found in local records (Offline).');
        }
    } catch (error: any) {
        console.error('[Verify] SQLite Search Error:', error.message);
        throw new Error('Offline search failed. Please try again.');
    }
};
