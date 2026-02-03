import api from './api';
import axios, { AxiosError } from 'axios';
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

const logAxiosError = (err: any) => {
    const e = err as AxiosError;
    console.log('[Verify][AxiosError]', {
        message: e.message,
        code: (e as any).code,
        status: e.response?.status,
        data: e.response?.data,
        headers: e.response?.headers,
        url: e.config?.url,
        baseURL: e.config?.baseURL,
        method: e.config?.method,
        timeout: e.config?.timeout,
    });
};

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
        console.log('[Verify] Calling Verification API via Backend...');


        try {
            // Use the centralized API instance which points to smart-verify-server
            // The backend will proxy the request to the Laravel API
            const response = await api.get<{ success: boolean, statusCode: number, message: string, data: any }>('/verification', {
                params: { identifier }
            });

            console.log('[Verify] API Response:', JSON.stringify(response.data, null, 2));

            if (response.data && response.data.success && response.data.data) {
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
                const serverMsg = response.data?.message || 'No details provided';
                throw new Error(`Employee not found (Server says: ${serverMsg})`);
            }
        } catch (error: any) {
            console.warn('[Verify] API request failed:', error.message);

            if (error.response) {
                if (error.response.status === 404) {
                    console.warn('[Verify] API returned 404 Not Found. Skipping offline fallback.');
                    throw new Error('Employee not found (404)');
                }
                // Handle 500 or other server errors
                throw new Error(`Server Error (${error.response.status}): ${error.message}`);
            }

            if (error.message.includes('Employee not found') || error.message === 'Service mismatch') {
                throw error;
            }

            // User Requirement: "should not search offline when online"
            // If we attempted an online search (because isOffline was false), and it failed (e.g. Network Error),
            // we should NOT fall back to local storage. We should report the connection error.
            if (!isOffline) {
                throw new Error(`Online Verification Failed: ${error.message}. Please check your connection to the server.`);
            }

            console.warn('[Verify] Attempting fallback to local storage...');
            return await searchLocalStorage(identifier);
        }

    } catch (error: any) {
        logAxiosError(error);
        console.error('Verify Identifier Error:', error.message);
        throw error;
    }
};

// Extracted Helper
const searchLocalStorage = async (identifier: string): Promise<Employee> => {
    console.log('[Verify] Offline/Fallback mode. Searching local storage (SQLite)...');

    try {
        const results = await databaseService.searchEmployees(identifier);
        if (results && results.length > 0) {
            console.log(`[Verify] Found ${results.length} match(es) in local DB`);
            // Map EmployeeRecord to Employee
            const record = results[0];
            
          
            let firstName = '';
            let lastName = '';
            
            if (record.fullname) {
                const parts = record.fullname.split(' ');
                firstName = parts[0] || '';
                lastName = parts.slice(1).join(' ') || '';
            }

            const employee: Employee = {
                id: record.id,
                identifier: record.employee_number || record.employment_number || record.id,
                firstName: firstName,
                lastName: lastName,
                fullname: record.fullname,
                accountNumber: record.account_number,
                department: record.department,
                serviceId: record.service_id
            };

            return employee;
        }
        throw new Error('Employee not found in local storage');
    } catch (dbError: any) {
         console.error('[Verify] Local storage search failed:', dbError.message);
         throw new Error('Employee not found (Offline)');
    }
};
