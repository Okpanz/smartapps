import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Switch
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../hooks/useAuthStore';
import { useNavigation } from '@react-navigation/native';
import { changePassword, downloadOfflineRecords } from '../../services/auth';
import Ionicons from 'react-native-vector-icons/Ionicons';
import ReactNativeBiometrics from 'react-native-biometrics';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function SettingsScreen() {
  const { user, logout, login } = useAuthStore();
  const navigation = useNavigation<any>();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [loadingPassword, setLoadingPassword] = useState(false);
  
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const rnBiometrics = new ReactNativeBiometrics();

  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

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
            Alert.alert('Success', `Biometric login enabled with ${biometryType === 'FaceID' ? 'Face ID' : 'Fingerprint'}`);
          } else {
            setBiometricEnabled(false);
          }
        } else {
          Alert.alert('Not Supported', 'Biometric authentication is not available on this device.');
          setBiometricEnabled(false);
        }
      } catch (error) {
        console.error('Biometric error', error);
        Alert.alert('Error', 'Failed to enable biometric login');
        setBiometricEnabled(false);
      }
    }
  };

  const handleDownloadOfflineData = async () => {
    try {
      setDownloading(true);
      setDownloadProgress(0);
      
      let serviceId = user?.service_id || '234070795';
      if (serviceId === 1 || serviceId === '1') {
         serviceId = '234070795';
      }
      
      const totalCount = await downloadOfflineRecords((count) => {
        setDownloadProgress(count);
      }, serviceId);
      
      Alert.alert(
        'Download Complete', 
        `Successfully downloaded ${totalCount} employee records for offline use.`
      );
    } catch (error: any) {
      console.error('Download failed', error);
      Alert.alert('Download Failed', error.message || 'Could not download records');
    } finally {
      setDownloading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) return;

    setLoadingPassword(true);
    try {
      await changePassword({ currentPassword, newPassword });
      Alert.alert('Password changed');
      setCurrentPassword('');
      setNewPassword('');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Password change failed');
    } finally {
      setLoadingPassword(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Log out?', 'You will need to sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: () => {
          logout();
          navigation.replace('Landing');
        }
      }
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="px-6 py-5 bg-white border-b border-gray-100">
        <Text className="text-2xl font-bold text-gray-900">Settings</Text>
        <Text className="text-sm text-gray-500 mt-1">
          Account & security preferences
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-6 pt-6"
        showsVerticalScrollIndicator={false}
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

        {/* OFFLINE DATA */}
        <View className="mb-10">
          <Text className="text-xs font-semibold text-gray-400 mb-3 uppercase">
            Offline Mode
          </Text>

          <View className="bg-white rounded-2xl border border-gray-100 p-4">
            <View className="flex-row items-center justify-between mb-4">
               <View className="flex-row items-center flex-1">
                  <View className="w-10 h-10 rounded-full bg-blue-50 items-center justify-center mr-3">
                     <Ionicons name="cloud-download-outline" size={20} color="#2563EB" />
                  </View>
                  <View>
                     <Text className="text-base font-medium text-gray-900">Download Records</Text>
                     <Text className="text-xs text-gray-500">Save employee data for offline search</Text>
                  </View>
               </View>
            </View>

            {downloading && (
               <View className="mb-4">
                  <Text className="text-xs text-blue-600 font-medium mb-1 text-center">
                    Downloading... {downloadProgress} records fetched
                  </Text>
                  <ActivityIndicator color="#2563EB" />
               </View>
            )}

            <TouchableOpacity
              onPress={handleDownloadOfflineData}
              disabled={downloading}
              className={`rounded-xl py-3 items-center ${
                downloading ? 'bg-blue-200' : 'bg-blue-600'
              }`}
            >
              <Text className="text-white font-bold">
                {downloading ? 'Syncing...' : 'Download Offline Data'}
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
