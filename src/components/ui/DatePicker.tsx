import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
  AccessibilityInfo,
  findNodeHandle,
} from 'react-native';

type Props = {
  label: string;
  value?: string | null;
  onChange: (v: string) => void;
  minYear?: number;
  maxYear?: number;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  dateFormat?: (date: Date) => string;
};

const pad = (n: number) => (n < 10 ? `0${n}` : String(n));

const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate();

const defaultDateFormat = (date: Date) => {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const parseDate = (dateString: string): Date | null => {
  const parts = dateString.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) {
      return new Date(y, m, d);
    }
  }
  return null;
};

export default function DatePicker({
  label,
  value,
  onChange,
  minYear = 1900,
  maxYear,
  placeholder = 'Select date',
  error,
  disabled = false,
  required = false,
  dateFormat = defaultDateFormat,
}: Props) {
  const [visible, setVisible] = useState(false);
  const now = new Date();
  const maxY = maxYear || now.getFullYear();
  const triggerRef = useRef<View>(null);
  const modalRef = useRef<View>(null);

  // Validate year range
  useEffect(() => {
    if (minYear > maxY) {
      console.warn(`minYear (${minYear}) cannot be greater than maxYear (${maxY})`);
    }
  }, [minYear, maxY]);

  const initial = useMemo(() => {
    if (value) {
      const parsed = parseDate(value);
      if (parsed) {
        return {
          y: parsed.getFullYear(),
          m: parsed.getMonth() + 1,
          d: parsed.getDate(),
        };
      }
    }
    // Default to today if no value
    return {
      y: now.getFullYear(),
      m: now.getMonth() + 1,
      d: now.getDate(),
    };
  }, [value]);

  const [year, setYear] = useState(initial.y);
  const [month, setMonth] = useState(initial.m);
  const [day, setDay] = useState(initial.d);

  // Update internal state when value changes externally
  useEffect(() => {
    setYear(initial.y);
    setMonth(initial.m);
    setDay(initial.d);
  }, [initial.y, initial.m, initial.d]);

  const years = useMemo(() => {
    const arr: number[] = [];
    const start = Math.max(minYear, 1900);
    for (let y = maxY; y >= start; y--) arr.push(y);
    return arr;
  }, [maxY, minYear]);

  const months = useMemo(
    () => [
      { value: 1, label: 'January' },
      { value: 2, label: 'February' },
      { value: 3, label: 'March' },
      { value: 4, label: 'April' },
      { value: 5, label: 'May' },
      { value: 6, label: 'June' },
      { value: 7, label: 'July' },
      { value: 8, label: 'August' },
      { value: 9, label: 'September' },
      { value: 10, label: 'October' },
      { value: 11, label: 'November' },
      { value: 12, label: 'December' },
    ],
    []
  );

  const days = useMemo(
    () =>
      Array.from({ length: daysInMonth(year, month) }, (_, i) => ({
        value: i + 1,
        label: pad(i + 1),
      })),
    [year, month]
  );

  const displayValue = useMemo(() => {
    if (!value) return '';
    const parsed = parseDate(value);
    return parsed ? dateFormat(parsed) : '';
  }, [value, dateFormat]);

  const handleApply = () => {
    const maxDay = daysInMonth(year, month);
    const adjustedDay = Math.min(day, maxDay);
    const newValue = `${year}-${pad(month)}-${pad(adjustedDay)}`;
    onChange(newValue);
    setVisible(false);

    // Announce selection for accessibility
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      const selectedDate = new Date(year, month - 1, adjustedDay);
      AccessibilityInfo.announceForAccessibility(
        `Date selected: ${selectedDate.toLocaleDateString()}`
      );
    }
  };

  const resetFromValue = () => {
    setYear(initial.y);
    setMonth(initial.m);
    setDay(initial.d);
  };

  const handleOpen = () => {
    if (disabled) return;
    resetFromValue();
    setVisible(true);
  };

  // Quick navigation to today
  const handleGoToToday = () => {
    const today = new Date();
    if (today.getFullYear() >= minYear && today.getFullYear() <= maxY) {
      setYear(today.getFullYear());
      setMonth(today.getMonth() + 1);
      setDay(today.getDate());
    }
  };

  return (
    <View className="mb-4">
      <View className="flex-row items-center mb-1.5">
        <Text className="text-sm font-medium text-gray-700">{label}</Text>
        {required && <Text className="text-red-500 ml-1">*</Text>}
      </View>

      <TouchableOpacity
        ref={triggerRef}
        className={`
          h-12 px-4 rounded-xl border bg-white text-base justify-center
          ${error ? 'border-red-500' : 'border-gray-200'}
          ${disabled ? 'opacity-50 bg-gray-100' : ''}
        `}
        onPress={handleOpen}
        disabled={disabled}
        activeOpacity={disabled ? 1 : 0.8}
        accessibilityLabel={label}
        accessibilityHint="Double tap to select date"
        accessibilityState={{ disabled }}
        accessibilityRole="button"
      >
        <Text
          className={`
            text-base
            ${displayValue ? 'text-gray-900' : 'text-gray-400'}
          `}
        >
          {displayValue || placeholder}
        </Text>
      </TouchableOpacity>

      {error && (
        <Text className="text-sm text-red-500 mt-1 ml-1" accessibilityRole="alert">
          {error}
        </Text>
      )}

      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={() => setVisible(false)}
        statusBarTranslucent
      >
        <View
          ref={modalRef}
          className="flex-1 bg-black/50 justify-end"
          accessible={true}
          accessibilityViewIsModal={true}
          onAccessibilityEscape={() => setVisible(false)}
        >
          <View className="bg-white rounded-t-2xl p-4" accessibilityRole="adjustable">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-lg font-semibold text-gray-900">{label}</Text>
              <TouchableOpacity
                onPress={handleGoToToday}
                className="px-3 py-1 rounded-full bg-green-50"
                accessibilityLabel="Go to today"
                accessibilityHint="Navigates to current date"
              >
                <Text className="text-green-600 font-medium text-sm">Today</Text>
              </TouchableOpacity>
            </View>

            <View className="flex-row h-64">
              {/* Year Picker */}
              <View className="flex-1 mr-1">
                <Text className="text-xs font-medium text-gray-500 mb-2 px-3">Year</Text>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingVertical: 8 }}
                >
                  {years.map((y) => (
                    <TouchableOpacity
                      key={y}
                      className={`
                        py-3 px-3 rounded-lg mb-1
                        ${y === year ? 'bg-green-600' : 'active:bg-gray-100'}
                      `}
                      onPress={() => setYear(y)}
                      accessibilityLabel={`Year ${y}`}
                      accessibilityState={{ selected: y === year }}
                    >
                      <Text
                        className={`
                          text-sm text-center
                          ${y === year ? 'text-white font-semibold' : 'text-gray-700'}
                        `}
                      >
                        {y}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Month Picker */}
              <View className="flex-1 mx-1">
                <Text className="text-xs font-medium text-gray-500 mb-2 px-3">Month</Text>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingVertical: 8 }}
                >
                  {months.map((m) => (
                    <TouchableOpacity
                      key={m.value}
                      className={`
                        py-3 px-3 rounded-lg mb-1
                        ${m.value === month ? 'bg-green-600' : 'active:bg-gray-100'}
                      `}
                      onPress={() => setMonth(m.value)}
                      accessibilityLabel={m.label}
                      accessibilityState={{ selected: m.value === month }}
                    >
                      <Text
                        className={`
                          text-sm text-center
                          ${m.value === month ? 'text-white font-semibold' : 'text-gray-700'}
                        `}
                      >
                        {m.label.substring(0, 3)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Day Picker */}
              <View className="flex-1 ml-1">
                <Text className="text-xs font-medium text-gray-500 mb-2 px-3">Day</Text>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingVertical: 8 }}
                >
                  {days.map((d) => (
                    <TouchableOpacity
                      key={d.value}
                      className={`
                        py-3 px-3 rounded-lg mb-1
                        ${d.value === day ? 'bg-green-600' : 'active:bg-gray-100'}
                      `}
                      onPress={() => setDay(d.value)}
                      accessibilityLabel={`Day ${d.label}`}
                      accessibilityState={{ selected: d.value === day }}
                    >
                      <Text
                        className={`
                          text-sm text-center
                          ${d.value === day ? 'text-white font-semibold' : 'text-gray-700'}
                        `}
                      >
                        {d.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>

            <View className="flex-row gap-3 mt-4">
              <TouchableOpacity
                className="flex-1 py-3 rounded-xl border border-gray-200 items-center active:bg-gray-50"
                onPress={() => setVisible(false)}
                accessibilityLabel="Cancel"
                accessibilityRole="button"
              >
                <Text className="font-semibold text-gray-700">Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                className="flex-1 py-3 rounded-xl bg-green-600 items-center active:bg-green-700"
                onPress={handleApply}
                accessibilityLabel="Apply"
                accessibilityRole="button"
              >
                <Text className="font-semibold text-white">Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
