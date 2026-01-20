export interface Activity {
    id: string;
    name: string;
    type: string;
    time: string;
    status: 'Completed' | 'Pending' | 'Failed';
    statusColor: string;
    bgIcon: string;
    icon: any;
    iconColor: string;
}

export const DUMMY_ACTIVITIES: Activity[] = [
    {
        id: '1',
        name: 'John Doe',
        type: 'Identity Enrollment',
        time: '12 mins ago',
        status: 'Completed',
        statusColor: 'text-green-600',
        bgIcon: 'bg-green-100',
        icon: 'person-add',
        iconColor: '#059669'
    },
    {
        id: '2',
        name: 'Sarah Wilson',
        type: 'Biometric Update',
        time: '1 hour ago',
        status: 'Pending',
        statusColor: 'text-amber-600',
        bgIcon: 'bg-amber-100',
        icon: 'finger-print',
        iconColor: '#D97706'
    },
    {
        id: '3',
        name: 'Michael Chen',
        type: 'Facial Capture',
        time: '3 hours ago',
        status: 'Failed',
        statusColor: 'text-red-600',
        bgIcon: 'bg-red-100',
        icon: 'alert-circle',
        iconColor: '#DC2626'
    },
    {
        id: '4',
        name: 'Robert Fox',
        type: 'New Enrollment',
        time: 'Yesterday',
        status: 'Completed',
        statusColor: 'text-green-600',
        bgIcon: 'bg-green-100',
        icon: 'person-add',
        iconColor: '#059669'
    },
    {
        id: '5',
        name: 'Emily Davis',
        type: 'Information Update',
        time: 'Yesterday',
        status: 'Completed',
        statusColor: 'text-green-600',
        bgIcon: 'bg-green-100',
        icon: 'document-text',
        iconColor: '#059669'
    },
    {
        id: '6',
        name: 'William Taylor',
        type: 'Identity Enrollment',
        time: '2 days ago',
        status: 'Completed',
        statusColor: 'text-green-600',
        bgIcon: 'bg-green-100',
        icon: 'person-add',
        iconColor: '#059669'
    },
    {
        id: '7',
        name: 'Jessica Brown',
        type: 'Fingerprint Scan',
        time: '2 days ago',
        status: 'Completed',
        statusColor: 'text-green-600',
        bgIcon: 'bg-green-100',
        icon: 'finger-print',
        iconColor: '#059669'
    },
    {
        id: '8',
        name: 'David Miller',
        type: 'ID Verification',
        time: '3 days ago',
        status: 'Pending',
        statusColor: 'text-amber-600',
        bgIcon: 'bg-amber-100',
        icon: 'card',
        iconColor: '#D97706'
    }
];
