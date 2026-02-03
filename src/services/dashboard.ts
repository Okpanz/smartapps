import api from './api';
import { databaseService } from './database';

export interface DashboardStats {
    total: { value: number | string, change: string };
    verified: { value: number | string, change: string };
    pending: { value: number | string, change: string };
    thisMonth: { value: number | string, change: string };
}

export const getDashboardStats = async (): Promise<DashboardStats> => {
    try {
        const response = await api.get('/dashboard/stats');
        if (response.data && response.data.success) {
            await databaseService.saveAppData('dashboard_stats', response.data.data);
            return response.data.data;
        }
        throw new Error('Failed to fetch stats');
    } catch (error: any) {
                console.error('[DashboardService] Error fetching stats:', error.message, error.response?.status, JSON.stringify(error.response?.data));
                
                const cachedStats = await databaseService.getAppData<DashboardStats>('dashboard_stats');
        if (cachedStats) {
             console.log('[DashboardService] Using cached stats');
             return cachedStats;
        }

        // Return fallback data
        return {
            total: { value: 0, change: '0%' },
            verified: { value: 0, change: '0%' },
            pending: { value: 0, change: '0%' },
            thisMonth: { value: 0, change: '0%' }
        };
    }
};
