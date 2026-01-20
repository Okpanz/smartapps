export interface Employee {
    id: string;
    identifier: string;
    firstName: string;
    lastName: string;
    accountNumber: string;
    department: string;
}

export const verifyIdentifier = async (identifier: string): Promise<Employee> => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            // Mock validation: 10 digits required for success
            if (identifier.length >= 10 && /^\d+$/.test(identifier)) {
                resolve({
                    id: 'EMP-' + Math.floor(Math.random() * 10000),
                    identifier,
                    firstName: 'Jane',
                    lastName: 'Smith',
                    accountNumber: identifier,
                    department: 'Engineering',
                });
            } else {
                reject(new Error('Invalid identifier. Must be at least 10 digits.'));
            }
        }, 1500);
    });
};
