import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Switch,
  Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTabBarBottomInset } from '../../navigation/TabNavigator';
import { useAuthStore } from '../../hooks/useAuthStore';
import { useNavigation } from '@react-navigation/native';
import { changePassword, downloadOfflineRecords, createAdhockStaff } from '../../services/auth';
import { syncPendingEnrollments } from '../../services/enrollment';
import Ionicons from 'react-native-vector-icons/Ionicons';
import ReactNativeBiometrics from 'react-native-biometrics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';
import { CustomAlert, AlertType } from '../../components/ui/CustomAlert';
import { isSmallDevice } from '../../utils/responsive';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';

export default function SettingsScreen() {
  const bottomInset = useTabBarBottomInset();
  const { 
    user, 
    logout, 
    login, 
    syncStatus, 
    lastSyncTime, 
    setSyncStatus, 
    setLastSyncTime,
    pendingUploadsCount,
    uploadStatus
  } = useAuthStore();
  const navigation = useNavigation<any>();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [loadingPassword, setLoadingPassword] = useState(false);
  
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const rnBiometrics = new ReactNativeBiometrics();
  const { get, fetchForCurrentService } = useFeatureFlags();
  React.useEffect(() => { fetchForCurrentService(); }, []);

  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadPercentage, setDownloadPercentage] = useState(0);

  // Adhock Staff Creation State
  const [staffModalVisible, setStaffModalVisible] = useState(false);
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffServiceId, setStaffServiceId] = useState('');
  const [creatingStaff, setCreatingStaff] = useState(false);

  const [alertConfig, setAlertConfig] = useState<{
      visible: boolean;
      title: string;
      message: string;
      type: AlertType;
      confirmText?: string;
      onConfirm?: () => void;
      showCancel?: boolean;
      cancelText?: string;
      onCancel?: () => void;
  }>({
      visible: false,
      title: '',
      message: '',
      type: 'info',
      showCancel: false
  });

  const showAlert = (
      title: string, 
      message: string, 
      type: AlertType = 'info', 
      onConfirm?: () => void,
      options?: {
          confirmText?: string;
          showCancel?: boolean;
          cancelText?: string;
          onCancel?: () => void;
      }
  ) => {
      setAlertConfig({ 
          visible: true, 
          title, 
          message, 
          type, 
          onConfirm,
          confirmText: options?.confirmText,
          showCancel: options?.showCancel,
          cancelText: options?.cancelText,
          onCancel: options?.onCancel
      });
  };

  const hideAlert = () => {
      setAlertConfig(prev => ({ ...prev, visible: false }));
  };

  React.useEffect(() => {
    checkBiometricStatus();
  }, []);

  const checkBiometricStatus = async () => {
    try {
      const enabled = await AsyncStorage.getItem('biometricEnabled');
      setBiometricEnabled(enabled === 'true');
    } catch (error) {
      console.error('Failed to load biometric status', error);
    }
  };

  const toggleBiometric = async (value: boolean) => {
    if (!get('biometric_enabled', false)) {
      showAlert('Disabled', 'Biometric login is disabled for your service.', 'warning');
      return;
    }
    if (!value) {
      await AsyncStorage.setItem('biometricEnabled', 'false');
      setBiometricEnabled(false);
    } else {
      try {
        const { available, biometryType } = await rnBiometrics.isSensorAvailable();
        
        if (available && biometryType) {
          const { success } = await rnBiometrics.simplePrompt({ promptMessage: 'Confirm Identity to Enable' });
          
          if (success) {
            await AsyncStorage.setItem('biometricEnabled', 'true');
            setBiometricEnabled(true);
            showAlert('Success', `Biometric login enabled with ${biometryType === 'FaceID' ? 'Face ID' : 'Fingerprint'}`, 'success');
          } else {
            setBiometricEnabled(false);
          }
        } else {
          showAlert('Not Supported', 'Biometric authentication is not available on this device.', 'warning');
          setBiometricEnabled(false);
        }
      } catch (error) {
        console.error('Biometric error', error);
        showAlert('Error', 'Failed to enable biometric login', 'error');
        setBiometricEnabled(false);
      }
    }
  };

  const handleDownloadOfflineData = async () => {
    try {
      setDownloading(true);
      setSyncStatus('syncing');
      setDownloadProgress(0);
      
      console.log('[Settings] Current User:', JSON.stringify(user, null, 2));

      if (user?.service_id === undefined || user?.service_id === null) {
        console.log(`[Settings] Service ID not found in user profile: ${JSON.stringify(user)}`);
        throw new Error('Service ID not found in user profile. Please contact support.');
      }

      const totalCount = await downloadOfflineRecords((count, percentage) => {
        setDownloadProgress(count);
        if (percentage !== undefined) {
            setDownloadPercentage(percentage);
        }
      }, user.service_id);
      
      setSyncStatus('success');
      setLastSyncTime(new Date());

      showAlert(
        'Download Complete', 
        `Successfully downloaded ${totalCount} employee records for offline use.`,
        'success'
      );
    } catch (error: any) {
      console.error('Download failed', error);
      setSyncStatus('error');
      showAlert('Download Failed', error.message || 'Could not download records', 'error');
    } finally {
      setDownloading(false);
    }
  };

  const handleCreateStaff = async () => {
    if (!staffName || !staffEmail || !staffPassword || !staffServiceId) {
        showAlert('Validation Error', 'All fields are required', 'warning');
        return;
    }

    try {
        setCreatingStaff(true);
        await createAdhockStaff({
            name: staffName,
            email: staffEmail,
            password: staffPassword,
            service_id: staffServiceId
        });
        showAlert('Success', 'Adhock Staff created successfully', 'success');
        setStaffModalVisible(false);
        // Reset form
        setStaffName('');
        setStaffEmail('');
        setStaffPassword('');
        setStaffServiceId('');
    } catch (error: any) {
        showAlert('Error', error.message || 'Failed to create staff', 'error');
    } finally {
        setCreatingStaff(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) return;

    setLoadingPassword(true);
    try {
      await changePassword({ currentPassword, newPassword });
      showAlert('Password changed', 'Your password has been updated successfully', 'success');
      setCurrentPassword('');
      setNewPassword('');
    } catch (e: any) {
      showAlert('Error', e.message || 'Password change failed', 'error');
    } finally {
      setLoadingPassword(false);
    }
  };

  const performLogout = async () => {
        await logout();
        navigation.getParent()?.reset({
            index: 0,
            routes: [{ name: 'Landing' }],
        });
  };

  const handleLogout = () => {
    if (pendingUploadsCount > 0) {
        showAlert(
            'Unsynced Data',
            'You have pending enrollments that haven\'t been uploaded yet. We recommend syncing before logging out.',
            'warning',
            async () => {
                 // Sync Now
                 await handleSyncPending();
            }, 
            {
                confirmText: 'Sync Now',
                showCancel: true,
                cancelText: 'Logout Anyway',
                onCancel: () => {
                    performLogout();
                }
            }
        );
    } else {
        showAlert('Log out?', 'You will need to sign in again.', 'warning', performLogout, {
            confirmText: 'Log Out',
            showCancel: true,
            cancelText: 'Cancel'
        });
    }
  };

  const handleSyncPending = async () => {
    try {
      await syncPendingEnrollments();
      if (uploadStatus === 'error') {
        showAlert('Upload Failed', 'Some records could not be synced. Please try again.', 'error');
      }
    } catch (error) {
      showAlert('Error', 'Failed to trigger sync', 'error');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className={`py-5 bg-white border-b border-gray-100 ${isSmallDevice ? 'px-4' : 'px-6'}`}>
        <Text className="text-2xl font-bold text-gray-900">Settings</Text>
        <Text className="text-sm text-gray-500 mt-1">
          Account & security preferences
        </Text>
      </View>

      <ScrollView
        className={`flex-1 pt-6 ${isSmallDevice ? 'px-4' : 'px-6'}`}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset }}
      >
        {/* PROFILE */}
        <View className="mb-10">
          <Text className="text-xs font-semibold text-gray-400 mb-3 uppercase">
            Profile
          </Text>

          <View className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
            <Input
              label="Full Name"
              icon="person-outline"
              value={user?.name}
              editable={false}
              selectTextOnFocus={false}
            />

            <Input
              label="Email Address"
              icon="mail-outline"
              value={user?.email}
              editable={false}
              selectTextOnFocus={false}
            />
          </View>
        </View>

        {/* ADMIN PANEL */}
        {user?.role === 'admin' && (
            <View className="mb-10">
                <Text className="text-xs font-semibold text-gray-400 mb-3 uppercase">
                    Admin Panel
                </Text>
                <View className="bg-white rounded-2xl border border-gray-100 p-4">
                    <TouchableOpacity
                        onPress={() => setStaffModalVisible(true)}
                        className="flex-row items-center justify-between"
                    >
                        <View className="flex-row items-center flex-1">
                            <View className="w-10 h-10 rounded-full bg-purple-50 items-center justify-center mr-3">
                                <Ionicons name="people-outline" size={20} color="#7C3AED" />
                            </View>
                            <View>
                                <Text className="text-base font-medium text-gray-900">Create Adhock Staff</Text>
                                <Text className="text-xs text-gray-500">Add new staff members</Text>
                            </View>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                    </TouchableOpacity>
                </View>
            </View>
        )}

        {/* OFFLINE DATA */}
        <View className="mb-10">
          <Text className="text-xs font-semibold text-gray-400 mb-3 uppercase">
            Offline Data
          </Text>

          {/* Download Records Card */}
          <View className="bg-white rounded-2xl border border-gray-100 p-4">
            <View className="flex-row items-center mb-4">
              <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${
                  syncStatus === 'error' ? 'bg-red-50' : 'bg-blue-50'
              }`}>
                <Ionicons 
                  name={syncStatus === 'error' ? "alert-circle-outline" : "cloud-download-outline"} 
                  size={20} 
                  color={syncStatus === 'error' ? "#EF4444" : "#2563EB"} 
                />
              </View>
              <View>
                <Text className="text-base font-medium text-gray-900">
                  {syncStatus === 'error' ? 'Sync Failed' : 'Offline Records'}
                </Text>
                <Text className="text-xs text-gray-500">
                  {syncStatus === 'success' && lastSyncTime 
                    ? `Last synced: ${format(lastSyncTime, 'MMM d, h:mm a')}`
                    : syncStatus === 'error' 
                      ? 'Automatic sync failed. Please retry.'
                      : 'Save employee data for offline search'
                  }
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={handleDownloadOfflineData}
              disabled={downloading || syncStatus === 'syncing'}
              className={`rounded-xl py-3 items-center ${
                downloading || syncStatus === 'syncing' ? 'bg-blue-200' : syncStatus === 'error' ? 'bg-red-600' : 'bg-blue-600'
              }`}
            >
              <Text className="text-white font-bold">
                {downloading || syncStatus === 'syncing' 
                  ? `Syncing... ${downloadPercentage > 0 ? `${downloadPercentage}% (${downloadProgress})` : `(${downloadProgress})`}`
                  : syncStatus === 'error' 
                    ? 'Retry Sync' 
                    : 'Download Offline Data'
                }
              </Text>
            </TouchableOpacity>
          </View>

          {/* Upload Pending Enrollments Card */}
          <View className="bg-white rounded-2xl border border-gray-100 p-4 mt-4">
            <View className="flex-row items-center mb-4">
                <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${
                    uploadStatus === 'error' ? 'bg-red-50' : 'bg-orange-50'
                }`}>
                    <Ionicons 
                        name={uploadStatus === 'error' ? "alert-circle-outline" : "cloud-upload-outline"} 
                        size={20} 
                        color={uploadStatus === 'error' ? "#EF4444" : "#F97316"} 
                    />
                </View>
                <View>
                    <Text className="text-base font-medium text-gray-900">
                        Pending Submissions
                    </Text>
                    <Text className="text-xs text-gray-500">
                        {pendingUploadsCount} enrollments waiting to upload
                    </Text>
                </View>
            </View>

            <TouchableOpacity
                onPress={handleSyncPending}
                disabled={pendingUploadsCount === 0 || uploadStatus === 'syncing'}
                className={`rounded-xl py-3 items-center ${
                    pendingUploadsCount === 0 
                        ? 'bg-gray-100' 
                        : uploadStatus === 'error' 
                            ? 'bg-red-600' 
                            : 'bg-orange-500'
                }`}
            >
                <Text className={`font-bold ${pendingUploadsCount === 0 ? 'text-gray-400' : 'text-white'}`}>
                    {uploadStatus === 'syncing' 
                        ? 'Uploading...' 
                        : uploadStatus === 'error' 
                            ? 'Retry Upload' 
                            : 'Upload Pending Records'
                    }
                </Text>
            </TouchableOpacity>
          </View>

        </View>

        {/* SECURITY */}
        <View className="mb-10">
          <Text className="text-xs font-semibold text-gray-400 mb-3 uppercase">
            Security
          </Text>

          <View className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
            {/* Biometric Toggle */}
            <View className="flex-row items-center justify-between">
               <View className="flex-row items-center flex-1">
                  <View className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center mr-3">
                     <Ionicons name="finger-print-outline" size={20} color="#374151" />
                  </View>
                  <View>
                     <Text className="text-base font-medium text-gray-900">Biometric Login</Text>
                     <Text className="text-xs text-gray-500">Use FaceID or Fingerprint</Text>
                  </View>
               </View>
               <Switch
                  value={biometricEnabled}
                  onValueChange={toggleBiometric}
                  trackColor={{ false: '#E5E7EB', true: '#10B981' }}
                  thumbColor={'#fff'}
               />
            </View>
            
            <View className="h-[1px] bg-gray-100 my-2" />

            <Input
              label="Current Password"
              icon="lock-closed-outline"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry={!showPasswords}
              placeholder="••••••••"
            />

            <Input
              label="New Password"
              icon="lock-open-outline"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry={!showPasswords}
              placeholder="••••••••"
            />

            <TouchableOpacity
              onPress={() => setShowPasswords(v => !v)}
              className="flex-row items-center"
            >
              <Ionicons
                name={showPasswords ? 'eye-off-outline' : 'eye-outline'}
                size={16}
                color="#6B7280"
              />
              <Text className="ml-2 text-sm text-gray-500">
                {showPasswords ? 'Hide passwords' : 'Show passwords'}
              </Text>
            </TouchableOpacity>

            <PrimaryButton
              loading={loadingPassword}
              disabled={!currentPassword || !newPassword}
              text="Change Password"
              onPress={handleChangePassword}
            />
          </View>
        </View>

        {/* LOGOUT */}
        <TouchableOpacity
          onPress={handleLogout}
          className="mb-10 flex-row items-center justify-center rounded-xl border border-red-200 bg-red-50 py-4"
        >
          <Ionicons name="log-out-outline" size={20} color="#DC2626" />
          <Text className="ml-2 font-bold text-red-600">Log Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* CREATE STAFF MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={staffModalVisible}
        onRequestClose={() => setStaffModalVisible(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
            <View className="bg-white rounded-t-3xl p-6 h-[85%]">
                <View className="flex-row justify-between items-center mb-6">
                    <Text className="text-xl font-bold text-gray-900">Create Adhock Staff</Text>
                    <TouchableOpacity onPress={() => setStaffModalVisible(false)}>
                        <Ionicons name="close-circle" size={28} color="#9CA3AF" />
                    </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                    <View className="space-y-4">
                        <Input
                            label="Full Name"
                            icon="person-outline"
                            value={staffName}
                            onChangeText={setStaffName}
                            placeholder="e.g. John Doe"
                        />
                        <Input
                            label="Email Address"
                            icon="mail-outline"
                            value={staffEmail}
                            onChangeText={setStaffEmail}
                            placeholder="e.g. john@example.com"
                            autoCapitalize="none"
                            keyboardType="email-address"
                        />
                        <Input
                            label="Password"
                            icon="key-outline"
                            value={staffPassword}
                            onChangeText={setStaffPassword}
                            placeholder="Enter password"
                            secureTextEntry
                        />
                         <Input
                            label="Service ID"
                            icon="business-outline"
                            value={staffServiceId}
                            onChangeText={setStaffServiceId}
                            placeholder="e.g. 234006"
                            keyboardType="numeric"
                        />

                        <TouchableOpacity
                            onPress={handleCreateStaff}
                            disabled={creatingStaff}
                            className={`rounded-xl py-4 items-center mt-4 ${
                                creatingStaff ? 'bg-purple-300' : 'bg-purple-600'
                            }`}
                        >
                            {creatingStaff ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text className="text-white font-bold">Create Staff Account</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </View>
        </View>
      </Modal>

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onClose={hideAlert}
        onConfirm={alertConfig.onConfirm}
        confirmText={alertConfig.confirmText}
        showCancel={alertConfig.showCancel}
        cancelText={alertConfig.cancelText}
        onCancel={alertConfig.onCancel}
      />
    </SafeAreaView>
  );
}

/* ---------- Reusable Components ---------- */

function Input({ label, icon, ...props }: any) {
  return (
    <View>
      <Text className="text-sm text-gray-500 font-medium mb-1.5">
        {label}
      </Text>
      <View className="flex-row items-center bg-gray-50 border border-gray-200 rounded-xl px-4">
        <Ionicons name={icon} size={18} color="#6B7280" />
        <TextInput
          className="flex-1 px-3 py-3 text-gray-900 font-medium"
          {...props}
        />
      </View>
    </View>
  );
}

function PrimaryButton({ text, loading, disabled, onPress }: any) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      className={`rounded-xl py-4 items-center ${
        disabled ? 'bg-gray-300' : 'bg-gray-900'
      }`}
    >
      {loading ? (
        <ActivityIndicator color="white" />
      ) : (
        <Text className="text-white font-bold">{text}</Text>
      )}
    </TouchableOpacity>
  );
}
