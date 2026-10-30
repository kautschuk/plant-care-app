import { Text, View } from 'react-native';

import { DatePickerField } from './DatePickerField';

interface ScheduleReenableFieldsProps {
  readonly visible: boolean;
  readonly requiresFertilizingDate: boolean;
  readonly today: string;
  readonly lastWateredDate?: string;
  readonly lastFertilizedDate?: string;
  readonly onLastWateredDateChange: (value: string) => void;
  readonly onLastFertilizedDateChange: (value: string) => void;
}

export function ScheduleReenableFields({
  visible,
  requiresFertilizingDate,
  today,
  lastWateredDate,
  lastFertilizedDate,
  onLastWateredDateChange,
  onLastFertilizedDateChange,
}: ScheduleReenableFieldsProps) {
  if (!visible) return null;

  return (
    <View>
      <Text>Choose fresh last-care dates to start a new schedule.</Text>
      <DatePickerField
        label="Last watered date"
        value={lastWateredDate}
        maximumDate={today}
        onChange={onLastWateredDateChange}
      />
      {requiresFertilizingDate ? (
        <DatePickerField
          label="Last fertilized date"
          value={lastFertilizedDate}
          maximumDate={today}
          onChange={onLastFertilizedDateChange}
        />
      ) : null}
    </View>
  );
}
