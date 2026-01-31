import api from './api';

export interface AuditLog {
    _id: string;
    action: string;
    performed_by: string;
    target_resource: string;
    target_id: string;
    details: any;
    timestamp: string;
    ip_address?: string;
}

export const getRecentActivity = async (limit: number = 5): Promise<AuditLog[]> => {
    try {
        const response = await api.get(`/audit/recent?limit=${limit}`);
        if (response.data && response.data.success) {
            return response.data.data;
        }
        return [];
    } catch (error) {
        console.error('[ActivityService] Error fetching recent activity:', error);
        return [];
    }
};
