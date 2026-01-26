import React from 'react';
import { View, Text, Modal, TouchableOpacity } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

export type AlertType = 'success' | 'error' | 'info' | 'warning';

interface CustomAlertProps {
  visible: boolean;
  title: string;
  message: string;
  type?: AlertType;
  onClose: () => void;
  confirmText?: string;
  onConfirm?: () => void;
}

export const CustomAlert: React.FC<CustomAlertProps> = ({
  visible,
  title,
  message,
  type = 'info',
  onClose,
  confirmText = 'OK',
  onConfirm
}) => {
  const getIconName = () => {
    switch (type) {
      case 'success': return 'checkmark-circle';
      case 'error': return 'alert-circle';
      case 'warning': return 'warning';
      default: return 'information-circle';
    }
  };

  const getColor = () => {
    switch (type) {
      case 'success': return '#10B981'; // emerald-500
      case 'error': return '#EF4444'; // red-500
      case 'warning': return '#F59E0B'; // amber-500
      default: return '#3B82F6'; // blue-500
    }
  };

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-center items-center bg-black/50 px-4">
        <View className="bg-white w-full max-w-sm rounded-2xl p-6 items-center shadow-xl">
          <View className="mb-4">
            <Ionicons name={getIconName()} size={48} color={getColor()} />
          </View>
          
          <Text className="text-xl font-bold text-gray-900 text-center mb-2">
            {title}
          </Text>
          
          <Text className="text-base text-gray-500 text-center mb-6">
            {message}
          </Text>

          <View className="flex-row w-full space-x-3">
            <TouchableOpacity 
              className="flex-1 bg-primary py-3 rounded-xl items-center justify-center"
              style={{ backgroundColor: getColor() }}
              onPress={() => {
                if (onConfirm) onConfirm();
                onClose();
              }}
            >
              <Text className="text-white font-semibold text-base">
                {confirmText}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};
