import { useState } from 'react';
import { Button, Text, View } from 'react-native';

interface PlantLifecycleActionsProps {
  readonly archived: boolean;
  readonly plantName: string;
  readonly onArchive: () => void;
  readonly onRestore: () => void;
  readonly onDelete: () => void;
}

type Confirmation = 'archive' | 'delete' | null;

export function PlantLifecycleActions({
  archived,
  plantName,
  onArchive,
  onRestore,
  onDelete,
}: PlantLifecycleActionsProps) {
  const [confirmation, setConfirmation] = useState<Confirmation>(null);

  const confirmAction = () => {
    const action = confirmation;
    setConfirmation(null);
    if (action === 'archive') onArchive();
    if (action === 'delete') onDelete();
  };

  return (
    <View>
      {archived ? (
        <>
          <Button title="Restore plant" onPress={onRestore} />
          <Button title="Delete plant" color="#b42318" onPress={() => setConfirmation('delete')} />
        </>
      ) : (
        <Button title="Remove plant" onPress={() => setConfirmation('archive')} />
      )}
      {confirmation ? (
        <View accessibilityRole="alert">
          <Text>
            {confirmation === 'archive'
              ? `Archive ${plantName}? Its journal will remain available as a read-only memorial.`
              : `Permanently delete ${plantName} and its journal history? This cannot be undone.`}
          </Text>
          <Button
            title={confirmation === 'archive' ? 'Archive plant' : 'Delete permanently'}
            color={confirmation === 'delete' ? '#b42318' : undefined}
            onPress={confirmAction}
          />
          <Button title="Cancel" onPress={() => setConfirmation(null)} />
        </View>
      ) : null}
    </View>
  );
}
