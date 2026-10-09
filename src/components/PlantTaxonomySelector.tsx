import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { getPlantTaxonomyOptions } from '../domain/knowledge';

interface PlantTaxonomySelectorProps {
  readonly genus: string;
  readonly species: string | undefined;
  readonly onGenusChange: (genus: string) => void;
  readonly onSpeciesChange: (species: string | undefined) => void;
}

interface SelectorOption {
  readonly label: string;
  readonly value: string | undefined;
}

const taxonomyOptions = getPlantTaxonomyOptions();

export function PlantTaxonomySelector({
  genus,
  species,
  onGenusChange,
  onSpeciesChange,
}: PlantTaxonomySelectorProps) {
  const [activeSelector, setActiveSelector] = useState<'genus' | 'species' | null>(null);
  const [filter, setFilter] = useState('');

  const selectedTaxonomy = taxonomyOptions.find((option) => option.genus === genus);
  const genusLevelAvailable = selectedTaxonomy?.genusLevelAvailable ?? false;
  const genusLevelOption: SelectorOption = {
    label: 'Genus-level guidance',
    value: undefined,
  };
  const speciesOptions = useMemo<readonly SelectorOption[]>(() => [
    ...(selectedTaxonomy?.species ?? []),
    ...(genusLevelAvailable ? [genusLevelOption] : []),
  ], [genusLevelAvailable, selectedTaxonomy]);
  const options: readonly SelectorOption[] = activeSelector === 'genus'
    ? taxonomyOptions.map(({ genus: optionGenus }) => ({
      label: optionGenus,
      value: optionGenus,
    }))
    : speciesOptions;
  const filteredOptions = options.filter((option) => (
    option.label.toLocaleLowerCase('en-US').includes(filter.trim().toLocaleLowerCase('en-US'))
  ));

  const selectedSpeciesLabel = species === undefined
    ? (genusLevelAvailable ? genusLevelOption.label : '')
    : (selectedTaxonomy?.species.find((option) => option.value === species)?.label ?? '');

  const openSelector = (selector: 'genus' | 'species') => {
    setFilter('');
    setActiveSelector(selector);
  };

  const selectOption = (option: SelectorOption) => {
    if (activeSelector === 'genus' && option.value !== undefined) {
      onGenusChange(option.value);
      onSpeciesChange(undefined);
    } else if (activeSelector === 'species') {
      onSpeciesChange(option.value);
    }
    setFilter('');
    setActiveSelector(null);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Genus</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => openSelector('genus')}
        style={styles.select}
      >
        <Text style={genus ? styles.value : styles.placeholder}>{genus || 'Select genus'}</Text>
      </Pressable>

      <Text style={styles.label}>Species</Text>
      <Pressable
        accessibilityRole="button"
        disabled={!genus}
        onPress={() => openSelector('species')}
        style={[styles.select, !genus && styles.disabled]}
      >
        <Text style={selectedSpeciesLabel ? styles.value : styles.placeholder}>
          {selectedSpeciesLabel || 'Select species'}
        </Text>
      </Pressable>

      <Modal
        animationType="slide"
        transparent
        visible={activeSelector !== null}
        onRequestClose={() => setActiveSelector(null)}
      >
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>
              {activeSelector === 'genus' ? 'Choose a genus' : 'Choose a species'}
            </Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setFilter}
              placeholder={`Filter ${activeSelector ?? ''} options`}
              style={styles.filter}
              value={filter}
            />
            <FlatList
              data={filteredOptions}
              keyExtractor={(option) => option.value ?? '__genus-level__'}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.empty}>No matching options.</Text>}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => selectOption(item)}
                  style={styles.option}
                >
                  <Text style={styles.optionText}>{item.label}</Text>
                </Pressable>
              )}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => setActiveSelector(null)}
              style={styles.cancel}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  label: {
    color: '#344054',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 4,
  },
  select: {
    backgroundColor: '#fff',
    borderColor: '#dfe9df',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  disabled: {
    backgroundColor: '#f2f4f7',
    opacity: 0.6,
  },
  value: {
    color: '#182230',
  },
  placeholder: {
    color: '#667085',
  },
  overlay: {
    backgroundColor: 'rgba(16, 24, 40, 0.45)',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    maxHeight: '80%',
    padding: 16,
  },
  modalTitle: {
    color: '#182230',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  filter: {
    borderColor: '#d0d5dd',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  option: {
    borderBottomColor: '#eaecf0',
    borderBottomWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 14,
  },
  optionText: {
    color: '#182230',
  },
  empty: {
    color: '#667085',
    padding: 14,
    textAlign: 'center',
  },
  cancel: {
    alignItems: 'center',
    padding: 12,
  },
  cancelText: {
    color: '#1f7a4d',
    fontWeight: '600',
  },
});
