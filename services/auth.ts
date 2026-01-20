export interface User {
    id: string;
    username: string;
    name: string;
}

export const login = async (username: string, password: string): Promise<User> => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            if (username && password) {
                resolve({
                    id: '1',
                    username,
                    name: 'John Doe',
                });
            } else {
                reject(new Error('Invalid credentials'));
            }
        }, 1000); // Simulate network delay
    });
};
