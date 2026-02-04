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

export const getRecentActivity = async (
    limit: number = 20, 
    search?: string, 
    filters?: { startDate?: string; endDate?: string; action?: string }
): Promise<AuditLog[]> => {
    try {
        const params: any = { limit };
        if (search) params.search = search;
        if (filters?.startDate) params.startDate = filters.startDate;
        if (filters?.endDate) params.endDate = filters.endDate;
        if (filters?.action) params.action = filters.action;

        const response = await api.get('/audit/logs', { params });
        
        if (response.data && response.data.success) {
            // Handle paginated response structure
            if (response.data.data && Array.isArray(response.data.data.data)) {
                return response.data.data.data;
            }
            // Fallback if it returns array directly (unlikely based on current backend)
            if (Array.isArray(response.data.data)) {
                return response.data.data;
            }
        }
        return [];
    } catch (error) {
        console.error('[ActivityService] Error fetching recent activity:', error);
        return [];
    }
};
