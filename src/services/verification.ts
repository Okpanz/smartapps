import axios from 'axios';
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { databaseService } from './database';
import { useAuthStore } from '../hooks/useAuthStore';

export interface Employee {
    id: string;
    identifier: string;
    firstName: string;
    lastName: string;
    fullname: string;
    accountNumber: string;
    department: string;
    serviceId: string;
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
                timeout: 10000
            });

            console.log('[Verify] API Response:', JSON.stringify(response.data, null, 2));

            if (response.data && response.data.status && response.data.data) {
                const foundEmployee = response.data.data;
                let employeeData: any = null;
                
                console.log('[Verify] Raw foundEmployee:', JSON.stringify(foundEmployee, null, 2));

                // Extract employee object from various possible structures
                if (foundEmployee.employee) {
                    employeeData = foundEmployee.employee;
                } else if (foundEmployee.employees && Array.isArray(foundEmployee.employees)) {
                    employeeData = foundEmployee.employees[0];
                } else if (Array.isArray(foundEmployee)) {
                    employeeData = foundEmployee[0];
                } else {
                    employeeData = foundEmployee;
                }

                if (!employeeData) throw new Error('Employee not found in API response');

                // Double check if we need to unwrap one more level (e.g. data.data.employee.employee)
                if (!employeeData.fullname && employeeData.employee) {
                    console.log('[Verify] unwrapping nested employee object...');
                    employeeData = employeeData.employee;
                }
                
                console.log('[Verify] Final extracted employeeData keys:', Object.keys(employeeData));
                console.log('[Verify] Employee Name:', employeeData.fullname);

                // Ensure required fields are present (handle potential naming variations)
                const fullname = employeeData.fullname || employeeData.full_name || employeeData.name || '';
                const accountNumber = employeeData.account_number || employeeData.accountNumber || '';
                const department = employeeData.department || '';
                const serviceId = employeeData.service_id || employeeData.serviceId;

                // Save to local DB for future offline access
                try {
                   console.log('[Verify] Saving verified employee to local DB...');
                   // Make sure we save the standardized structure
                   const employeeToSave = {
                       ...employeeData,
                       fullname,
                       account_number: accountNumber,
                       department,
                       service_id: serviceId
                   };
                   await databaseService.upsertEmployees([employeeToSave]);
                } catch (dbError) {
                   console.warn('[Verify] Failed to save verified employee to local DB:', dbError);
                }

                const nameParts = fullname.split(' ');
                const firstName = nameParts[0] || '';
                const lastName = nameParts.slice(1).join(' ') || '';

                const currentUser = useAuthStore.getState().user;
                // Check for service mismatch for adhock staff
                if (currentUser?.role === 'adhock') {
                    const employeeServiceId = String(serviceId || '');
                    const userServiceId = String(currentUser.service_id || '');
                    
                    console.log(`[Verify] Checking Service Match: Employee(${employeeServiceId}) vs User(${userServiceId})`);
                    
                    if (employeeServiceId !== userServiceId) {
                         throw new Error('Service mismatch');
                    }
                }

                return {
                    id: employeeData.employee_number || employeeData.employment_number || employeeData.id,
                    identifier: identifier,
                    firstName,
                    lastName,
                    fullname: fullname,
                    accountNumber: accountNumber,
                    department: department,
                    serviceId: String(serviceId || '')
                };
            } else {
                throw new Error(response.data?.message || 'Employee not found');
            }
        } catch (error: any) {
            console.warn('[Verify] API request failed, attempting fallback to local storage:', error.message);
            
            if (error.response && error.response.status === 404) {
                console.warn('[Verify] API returned 404 Not Found. Skipping offline fallback.');
                throw new Error('Employee not found');
            }

            if (error.message === 'Employee not found' || error.message === 'Employee not found in API response' || error.message === 'Service mismatch') {
                throw error;
            }

            return await searchLocalStorage(identifier);
        }

    } catch (error: any) {
        console.error('Verify Identifier Error:', error.message);
        throw error; 
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

            const currentUser = useAuthStore.getState().user;
            if (currentUser?.role === 'adhock' && String(foundEmployee.service_id) !== String(currentUser.service_id)) {
                 throw new Error('Service mismatch');
            }

            return {
                id: foundEmployee.employee_number || foundEmployee.employment_number || foundEmployee.id,
                identifier: identifier,
                firstName,
                lastName,
                fullname: foundEmployee.fullname,
                accountNumber: foundEmployee.account_number,
                department: foundEmployee.department,
                serviceId: String(foundEmployee.service_id)
            };
        } else {
            console.log(`[Verify] No local match found for identifier: ${identifier}`);
            throw new Error('Employee not found in local records (Offline).');
        }
    } catch (error: any) {
        console.error('[Verify] SQLite Search Error:', error.message);
        // Don't mask specific errors like "Service mismatch"
        if (error.message === 'Service mismatch') {
            throw error;
        }
        throw new Error('Offline search failed. Please try again.');
    }
};
