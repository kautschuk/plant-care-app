import { useEffect, useState } from 'react';
import {
  Button,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { openPersistenceStore } from './src/adapters/sqlite/database';
import type { PersistenceStore } from './src/domain/persistence/repositories';
import type {
  HouseholdSettings,
  PlantCareConfiguration,
  PlantRecord,
} from './src/domain/persistence/types';
import { createPlant, saveHouseholdSettings } from './src/application';

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function App() {
  const [store, setStore] = useState<PersistenceStore | null>(null);
  const [settings, setSettings] = useState<HouseholdSettings | null>(null);
  const [plants, setPlants] = useState<ReadonlyArray<{ plant: PlantRecord; care: PlantCareConfiguration }>>([]);
  const [knowledgeLevel, setKnowledgeLevel] = useState('beginner');
  const [commitmentLevel, setCommitmentLevel] = useState('moderate');
  const [city, setCity] = useState('London');
  const [country, setCountry] = useState('United Kingdom');
  const [displayName, setDisplayName] = useState('Monstera');
  const [genus, setGenus] = useState('Monstera');
  const [species, setSpecies] = useState('Monstera deliciosa');
  const [lastCompletedDate, setLastCompletedDate] = useState(todayIso());
  const [lastFertilizingDate, setLastFertilizingDate] = useState(todayIso());
  const [schedulingEnabled, setSchedulingEnabled] = useState(true);

  useEffect(() => {
    let active = true;

    void (async () => {
      const nextStore = await openPersistenceStore();
      if (!active) return;
      setStore(nextStore);
      const nextSettings = await nextStore.householdSettings.get();
      setSettings(nextSettings);
      const nextPlants = await nextStore.plants.list(false);
      setPlants(nextPlants);
    })();

    return () => {
      active = false;
    };
  }, []);

  const refreshPlants = async (nextStore: PersistenceStore) => {
    const nextPlants = await nextStore.plants.list(false);
    setPlants(nextPlants);
  };

  const handleSaveSettings = async () => {
    if (!store) return;
    const nextSettings = await saveHouseholdSettings(
      { knowledgeLevel, commitmentLevel, city, country },
      store,
    );
    setSettings(nextSettings);
  };

  const handleCreatePlant = async () => {
    if (!store) return;
    const created = await createPlant(
      {
        id: `plant-${Date.now()}`,
        displayName,
        genus,
        species: species.trim() || undefined,
        fertilizerMode: 'LIQUID',
        schedulingEnabled,
        lastCompletedDate: lastCompletedDate as any,
        lastFertilizingDate: lastFertilizingDate as any,
      },
      store,
    );
    setPlants((current) => [...current, { plant: created.plant, care: created.care }]);
    setDisplayName('');
    setGenus('');
    setSpecies('');
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <StatusBar barStyle="dark-content" />

      <Text style={styles.title}>Plant Care</Text>
      <Text style={styles.sectionTitle}>Household</Text>

      <TextInput
        style={styles.input}
        placeholder="Knowledge level"
        value={knowledgeLevel}
        onChangeText={setKnowledgeLevel}
      />
      <TextInput
        style={styles.input}
        placeholder="Commitment level"
        value={commitmentLevel}
        onChangeText={setCommitmentLevel}
      />
      <TextInput style={styles.input} placeholder="City" value={city} onChangeText={setCity} />
      <TextInput
        style={styles.input}
        placeholder="Country"
        value={country}
        onChangeText={setCountry}
      />
      <Button title="Save household" onPress={handleSaveSettings} />

      {settings ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Current climate</Text>
          <Text>
            {settings.climate} ({settings.climateUsedFallback ? 'estimated' : 'resolved'})
          </Text>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Add plant</Text>
      <TextInput
        style={styles.input}
        placeholder="Plant name"
        value={displayName}
        onChangeText={setDisplayName}
      />
      <TextInput style={styles.input} placeholder="Genus" value={genus} onChangeText={setGenus} />
      <TextInput
        style={styles.input}
        placeholder="Species (optional)"
        value={species}
        onChangeText={setSpecies}
      />
      <TextInput
        style={styles.input}
        placeholder="Last completed date"
        value={lastCompletedDate}
        onChangeText={setLastCompletedDate}
      />
      <TextInput
        style={styles.input}
        placeholder="Last fertilizing date"
        value={lastFertilizingDate}
        onChangeText={setLastFertilizingDate}
      />

      <View style={styles.switchRow}>
        <Text>Enable scheduling</Text>
        <Switch value={schedulingEnabled} onValueChange={setSchedulingEnabled} />
      </View>
      <Button title="Create plant" onPress={handleCreatePlant} />

      <Text style={styles.sectionTitle}>Plant collection</Text>
      {plants.length === 0 ? (
        <Text style={styles.muted}>No plants yet. Add your first plant to begin.</Text>
      ) : (
        plants.map(({ plant, care }) => (
          <View key={plant.id} style={styles.card}>
            <Text style={styles.cardTitle}>{plant.displayName}</Text>
            <Text>{plant.genus}{plant.species ? ` • ${plant.species}` : ''}</Text>
            <Text>{care.schedulingEnabled ? 'Scheduling enabled' : 'Scheduling disabled'}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingTop: 72,
    backgroundColor: '#f5f7f3',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderColor: '#dfe9df',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  muted: {
    color: '#5a6a5e',
    marginTop: 8,
  },
});
