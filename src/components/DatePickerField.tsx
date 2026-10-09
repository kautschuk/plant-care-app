import { createElement, useState } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { DateTimePickerChangeEvent } from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

interface DatePickerFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}

function toDate(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function DatePickerField({ label, value, onChange }: DatePickerFieldProps) {
  const [isPickerVisible, setIsPickerVisible] = useState(false);

  const handleChange = (_event: DateTimePickerChangeEvent, date: Date) => {
    onChange(toISODate(date));
    if (Platform.OS === 'android') setIsPickerVisible(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      {Platform.OS === 'web' ? (
        createElement('input', {
          'aria-label': label,
          onChange: (event) => {
            if (event.currentTarget.value) onChange(event.currentTarget.value);
          },
          style: {
            backgroundColor: '#fff',
            border: '1px solid #dfe9df',
            borderRadius: '10px',
            boxSizing: 'border-box',
            color: '#182230',
            fontSize: 16,
            minHeight: 44,
            padding: '10px 12px',
            width: '100%',
          },
          type: 'date',
          value,
        })
      ) : (
        <>
          <Pressable
            accessibilityLabel={`${label}: ${value}`}
            accessibilityRole="button"
            onPress={() => setIsPickerVisible(true)}
            style={styles.select}
          >
            <Text style={styles.value}>{value}</Text>
          </Pressable>
          {isPickerVisible ? (
            <View style={Platform.OS === 'ios' ? styles.pickerPanel : undefined}>
              <DateTimePicker
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                mode="date"
                onDismiss={() => setIsPickerVisible(false)}
                onValueChange={handleChange}
                value={toDate(value)}
              />
              {Platform.OS === 'ios' ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setIsPickerVisible(false)}
                  style={styles.doneButton}
                >
                  <Text style={styles.doneText}>Done</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  label: {
    color: '#344054',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  select: {
    backgroundColor: '#fff',
    borderColor: '#dfe9df',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  value: {
    color: '#182230',
  },
  pickerPanel: {
    backgroundColor: '#fff',
    borderColor: '#dfe9df',
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
    padding: 8,
  },
  doneButton: {
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  doneText: {
    color: '#1f7a4d',
    fontWeight: '600',
  },
});
