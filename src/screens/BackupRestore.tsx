import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Share,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { format, parseISO } from 'date-fns';

import {
  verificationBackup,
  VerificationBackupRecord,
  ArchiveSummary,
} from '../services/verificationBackup';
import {
  restoreUnsyncedFromBackup,
  restoreSingleFromBackup,
} from '../services/enrollment';
import { CustomAlert, AlertType } from '../components/ui/CustomAlert';
import { isSmallDevice } from '../utils/responsive';

const prettyDate = (d: string): string => {
  try {
    return format(parseISO(d), 'EEEE, MMM d, yyyy');
  } catch {
    return d;
  }
};

export default function BackupRestoreScreen() {
  const navigation = useNavigation<any>();

  const [summary, setSummary] = useState<ArchiveSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [restoringAll, setRestoringAll] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [recordsByDate, setRecordsByDate] = useState<
    Record<string, VerificationBackupRecord[]>
  >({});
  const [detail, setDetail] = useState<VerificationBackupRecord | null>(null);

  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: AlertType;
    onConfirm?: () => void;
    showCancel?: boolean;
    confirmText?: string;
    cancelText?: string;
  }>({ visible: false, title: '', message: '', type: 'info' });

  const showAlert = (
    title: string,
    message: string,
    type: AlertType = 'info',
    onConfirm?: () => void,
    options?: { showCancel?: boolean; confirmText?: string; cancelText?: string }
  ) =>
    setAlertConfig({
      visible: true,
      title,
      message,
      type,
      onConfirm,
      showCancel: options?.showCancel,
      confirmText: options?.confirmText,
      cancelText: options?.cancelText,
    });
  const hideAlert = () => setAlertConfig((p) => ({ ...p, visible: false }));

  const loadSummary = useCallback(async () => {
    const s = await verificationBackup.getArchiveSummary();
    setSummary(s);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadSummary().finally(() => setLoading(false));
    }, [loadSummary])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSummary();
    // Refresh any expanded day too
    if (expandedDate) {
      const recs = await verificationBackup.listVerificationsForDate(expandedDate);
      setRecordsByDate((prev) => ({ ...prev, [expandedDate]: recs }));
    }
    setRefreshing(false);
  }, [loadSummary, expandedDate]);

  const toggleDate = async (date: string) => {
    if (expandedDate === date) {
      setExpandedDate(null);
      return;
    }
    setExpandedDate(date);
    if (!recordsByDate[date]) {
      const recs = await verificationBackup.listVerificationsForDate(date);
      setRecordsByDate((prev) => ({ ...prev, [date]: recs }));
    }
  };

  const handleRestoreAll = () => {
    if (!summary || summary.pending === 0) {
      showAlert('Nothing to Restore', 'All archived verifications are already synced.', 'info');
      return;
    }
    showAlert(
      'Restore Unsynced Records',
      `Re-queue ${summary.pending} unsynced verification${summary.pending === 1 ? '' : 's'} for upload? They will sync automatically when online.`,
      'warning',
      async () => {
        setRestoringAll(true);
        try {
          const res = await restoreUnsyncedFromBackup();
          await loadSummary();
          showAlert(
            'Restore Complete',
            `Re-queued ${res.restored} record${res.restored === 1 ? '' : 's'}.` +
              (res.alreadyQueued ? ` ${res.alreadyQueued} already in queue.` : ''),
            'success'
          );
        } catch (e: any) {
          showAlert('Restore Failed', e?.message || 'Could not restore records.', 'error');
        } finally {
          setRestoringAll(false);
        }
      },
      { showCancel: true, confirmText: 'Restore', cancelText: 'Cancel' }
    );
  };

  const handleRestoreOne = async (date: string, rec: VerificationBackupRecord) => {
    setRestoringId(rec.verificationId);
    try {
      const created = await restoreSingleFromBackup(date, rec.verificationId);
      await loadSummary();
      const recs = await verificationBackup.listVerificationsForDate(date);
      setRecordsByDate((prev) => ({ ...prev, [date]: recs }));
      showAlert(
        created ? 'Restored' : 'Already Queued',
        created
          ? 'Verification re-queued for upload.'
          : 'This verification is already in the upload queue.',
        created ? 'success' : 'info'
      );
    } catch (e: any) {
      showAlert('Restore Failed', e?.message || 'Could not restore this record.', 'error');
    } finally {
      setRestoringId(null);
    }
  };

  const handleExport = async (date: string) => {
    try {
      const json = await verificationBackup.exportDate(date);
      await Share.share({ title: `verifications_${date}.json`, message: json });
    } catch (e: any) {
      showAlert('Export Failed', e?.message || 'Could not export records.', 'error');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      {/* Header */}
      <View className={`py-4 bg-white border-b border-gray-100 flex-row items-center ${isSmallDevice ? 'px-4' : 'px-6'}`}>
        <TouchableOpacity onPress={() => navigation.goBack()} className="mr-3 -ml-1 p-1">
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <View>
          <Text className="text-xl font-bold text-gray-900">Backup & Restore</Text>
          <Text className="text-xs text-gray-500">Recover archived verifications</Text>
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#10B981" />
        </View>
      ) : (
        <ScrollView
          className={`flex-1 pt-5 ${isSmallDevice ? 'px-4' : 'px-6'}`}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* Summary */}
          <View className="bg-white rounded-2xl border border-gray-100 p-5 mb-5">
            <Text className="text-xs font-semibold text-gray-400 mb-4 uppercase">Archive Summary</Text>
            <View className="flex-row justify-between">
              <Stat label="Archived" value={summary?.totalRecords ?? 0} color="#111827" />
              <Stat label="Synced" value={summary?.synced ?? 0} color="#10B981" />
              <Stat label="Unsynced" value={summary?.pending ?? 0} color="#F97316" />
              <Stat label="Days" value={summary?.totalDates ?? 0} color="#2563EB" />
            </View>
          </View>

          {/* Restore all unsynced */}
          <View className="bg-white rounded-2xl border border-gray-100 p-4 mb-6">
            <View className="flex-row items-center mb-4">
              <View className="w-10 h-10 rounded-full bg-orange-50 items-center justify-center mr-3">
                <Ionicons name="cloud-upload-outline" size={20} color="#F97316" />
              </View>
              <View className="flex-1">
                <Text className="text-base font-medium text-gray-900">Restore Unsynced</Text>
                <Text className="text-xs text-gray-500">
                  Re-queue verifications that never uploaded
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={handleRestoreAll}
              disabled={restoringAll || (summary?.pending ?? 0) === 0}
              className={`rounded-xl py-3 items-center ${
                (summary?.pending ?? 0) === 0 ? 'bg-gray-100' : 'bg-orange-500'
              }`}
            >
              {restoringAll ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className={`font-bold ${(summary?.pending ?? 0) === 0 ? 'text-gray-400' : 'text-white'}`}>
                  {(summary?.pending ?? 0) === 0
                    ? 'Nothing to Restore'
                    : `Restore ${summary?.pending} Unsynced`}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Browse by date */}
          <Text className="text-xs font-semibold text-gray-400 mb-3 uppercase">Browse Archive</Text>
          {(summary?.byDate.length ?? 0) === 0 ? (
            <View className="items-center mt-8">
              <Ionicons name="archive-outline" size={48} color="#D1D5DB" />
              <Text className="text-gray-500 mt-3">No archived verifications yet</Text>
            </View>
          ) : (
            summary!.byDate.map((d) => (
              <View key={d.date} className="bg-white rounded-2xl border border-gray-100 mb-3 overflow-hidden">
                <TouchableOpacity
                  onPress={() => toggleDate(d.date)}
                  className="flex-row items-center justify-between p-4"
                >
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-gray-900">{prettyDate(d.date)}</Text>
                    <Text className="text-xs text-gray-500 mt-0.5">
                      {d.count} record{d.count === 1 ? '' : 's'}
                      {d.pending > 0 ? ` • ${d.pending} unsynced` : ' • all synced'}
                    </Text>
                  </View>
                  <View className="flex-row items-center">
                    <TouchableOpacity onPress={() => handleExport(d.date)} className="p-2 mr-1">
                      <Ionicons name="share-outline" size={20} color="#6B7280" />
                    </TouchableOpacity>
                    <Ionicons
                      name={expandedDate === d.date ? 'chevron-up' : 'chevron-down'}
                      size={20}
                      color="#9CA3AF"
                    />
                  </View>
                </TouchableOpacity>

                {expandedDate === d.date && (
                  <View className="border-t border-gray-100">
                    {(recordsByDate[d.date] || []).map((rec) => (
                      <View
                        key={rec.verificationId}
                        className="flex-row items-center px-4 py-3 border-b border-gray-50"
                      >
                        <View
                          className={`w-2 h-2 rounded-full mr-3 ${
                            rec.syncStatus === 'synced' ? 'bg-green-500' : 'bg-orange-500'
                          }`}
                        />
                        <TouchableOpacity className="flex-1" onPress={() => setDetail(rec)}>
                          <Text className="text-sm font-medium text-gray-900" numberOfLines={1}>
                            {rec.employee.fullname || rec.employee.id}
                          </Text>
                          <Text className="text-xs text-gray-400">
                            {format(parseISO(rec.verifiedAt), 'h:mm a')} • {rec.syncStatus}
                          </Text>
                        </TouchableOpacity>
                        {rec.syncStatus !== 'synced' && (
                          <TouchableOpacity
                            onPress={() => handleRestoreOne(d.date, rec)}
                            disabled={restoringId === rec.verificationId}
                            className="px-3 py-1.5 rounded-full bg-orange-50 border border-orange-100"
                          >
                            {restoringId === rec.verificationId ? (
                              <ActivityIndicator size="small" color="#F97316" />
                            ) : (
                              <Text className="text-xs font-semibold text-orange-600">Restore</Text>
                            )}
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Record detail modal */}
      <Modal visible={!!detail} transparent animationType="slide" onRequestClose={() => setDetail(null)}>
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-white rounded-t-3xl p-6 max-h-[80%]">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-lg font-bold text-gray-900">Verification Details</Text>
              <TouchableOpacity onPress={() => setDetail(null)}>
                <Ionicons name="close-circle" size={28} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <DetailRow label="Verification ID" value={detail?.verificationId} />
              <DetailRow label="Employee" value={detail?.employee.fullname || detail?.employee.id} />
              <DetailRow label="Account" value={detail?.employee.accountNumber || '—'} />
              <DetailRow label="Department" value={detail?.employee.department || '—'} />
              <DetailRow
                label="Verified At"
                value={detail ? format(parseISO(detail.verifiedAt), 'PPpp') : ''}
              />
              <DetailRow label="Sync Status" value={detail?.syncStatus} />
              <DetailRow label="Verifier" value={detail?.verifier.name || '—'} />
              <DetailRow label="Face Images" value={String(detail?.faceImages.length ?? 0)} />
              <DetailRow label="Fingerprints" value={String(detail?.fingerprints.length ?? 0)} />
              <DetailRow label="Documents" value={String(detail?.documents.length ?? 0)} />
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
        showCancel={alertConfig.showCancel}
        confirmText={alertConfig.confirmText}
        cancelText={alertConfig.cancelText}
      />
    </SafeAreaView>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View className="items-center">
      <Text className="text-2xl font-bold" style={{ color }}>
        {value}
      </Text>
      <Text className="text-xs text-gray-500 mt-1">{label}</Text>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  return (
    <View className="flex-row justify-between py-2.5 border-b border-gray-50">
      <Text className="text-sm text-gray-500">{label}</Text>
      <Text className="text-sm font-medium text-gray-900 ml-4 flex-1 text-right" numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}
