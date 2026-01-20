export const submitEnrollment = async (data: any): Promise<boolean> => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            // Mock successful submission
            resolve(true);
            // Random failure?
            // if (Math.random() > 0.9) reject(new Error('Network error'));
        }, 2000);
    });
};
