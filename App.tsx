import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { openPersistenceStore } from './src/adapters/sqlite/database';
import {
  applyPlantScheduleAction,
  archivePlant,
  createPlant,
  deletePlant,
  getPostponementQuickChoices,
  isValidCustomPostponementDays,
  projectHouseholdPlannerItems,
  recordCareCompletion,
  restorePlant,
  saveHouseholdSettings,
  updatePlant,
} from './src/application';
import type { PlannerItem, PlannerPlantInput } from './src/application';
import { findPlantKnowledge } from './src/domain/knowledge';
import type { ISODateString } from './src/domain/scheduling/types';
import type { PersistenceStore } from './src/domain/persistence/repositories';
import type {
  HouseholdSettings,
  PlantCareConfiguration,
  PlantRecord,
} from './src/domain/persistence/types';

const todayIso = (): ISODateString => new Date().toISOString().slice(0, 10) as ISODateString;
const knowledgeOptions = ['beginner', 'intermediate', 'experienced'] as const;
const commitmentOptions = ['casual', 'moderate', 'committed'] as const;

export default function App() {
  const [store, setStore] = useState<PersistenceStore | null>(null);
  const [settings, setSettings] = useState<HouseholdSettings | null>(null);
  const [plants, setPlants] = useState<ReadonlyArray<{ plant: PlantRecord; care: PlantCareConfiguration }>>([]);
  const [knowledgeLevel, setKnowledgeLevel] = useState<(typeof knowledgeOptions)[number]>('beginner');
  const [commitmentLevel, setCommitmentLevel] = useState<(typeof commitmentOptions)[number]>('moderate');
  const [city, setCity] = useState('London');
  const [country, setCountry] = useState('United Kingdom');
  const [displayName, setDisplayName] = useState('Monstera');
  const [genus, setGenus] = useState('Monstera');
  const [species, setSpecies] = useState('Monstera deliciosa');
  const [lastCompletedDate, setLastCompletedDate] = useState<string>(todayIso());
  const [lastFertilizingDate, setLastFertilizingDate] = useState<string>(todayIso());
  const [schedulingEnabled, setSchedulingEnabled] = useState(true);
  const [selectedPlantId, setSelectedPlantId] = useState<string | null>(null);
  const [draftPlantName, setDraftPlantName] = useState('');
  const [draftPlantGenus, setDraftPlantGenus] = useState('');
  const [draftPlantSpecies, setDraftPlantSpecies] = useState('');
  const [draftFertilizerMode, setDraftFertilizerMode] = useState<'NONE' | 'LIQUID' | 'LONG_TERM'>('NONE');
  const [draftSchedulingEnabled, setDraftSchedulingEnabled] = useState(true);
  const [plannerItems, setPlannerItems] = useState<PlannerItem[]>([]);
  const [customPostponementDays, setCustomPostponementDays] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const plannerActionInFlight = useRef(false);
  const [isPlannerActionPending, setIsPlannerActionPending] = useState(false);

  const refreshPlants = async (nextStore: PersistenceStore) => {
    const nextPlants = await nextStore.plants.list(false);
    setPlants(nextPlants);
    if (nextPlants.length === 0) {
      setSelectedPlantId(null);
      return;
    }

    const hasSelectedPlant = nextPlants.some(({ plant }) => plant.id === selectedPlantId);
    if (!hasSelectedPlant) {
      setSelectedPlantId(nextPlants[0].plant.id);
    }
  };

  useEffect(() => {
    let active = true;

    void (async () => {
      const nextStore = await openPersistenceStore();
      if (!active) return;
      setStore(nextStore);
      const nextSettings = await nextStore.householdSettings.get();
      setSettings(nextSettings);
      if (nextSettings) {
        setKnowledgeLevel(nextSettings.knowledgeLevel as (typeof knowledgeOptions)[number]);
        setCommitmentLevel(nextSettings.commitmentLevel as (typeof commitmentOptions)[number]);
        setCity(nextSettings.location.city);
        setCountry(nextSettings.location.country);
      }
      await refreshPlants(nextStore);
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!store || !settings) return;

    let active = true;
    void (async () => {
      const projectionPlants: PlannerPlantInput[] = [];
      for (const { plant, care } of plants) {
        if (!care.schedulingEnabled) continue;
        const schedule = await store.schedules.get(plant.id);
        if (!schedule) continue;
        const lookup = findPlantKnowledge({ genus: plant.genus, species: plant.species });
        if (lookup.status !== 'FOUND') continue;

        projectionPlants.push({
          plantId: plant.id,
          plantName: plant.displayName,
          schedule,
          knowledge: lookup.entry,
        });
      }

      if (active) {
        setPlannerItems(projectHouseholdPlannerItems({
          today: todayIso(),
          climate: settings.climate,
          plants: projectionPlants,
        }));
      }
    })();

    return () => {
      active = false;
    };
  }, [store, settings, plants]);

  const selectedPlant = useMemo(
    () => plants.find(({ plant }) => plant.id === selectedPlantId) ?? null,
    [plants, selectedPlantId],
  );

  useEffect(() => {
    if (!selectedPlant) return;
    setDraftPlantName(selectedPlant.plant.displayName);
    setDraftPlantGenus(selectedPlant.plant.genus);
    setDraftPlantSpecies(selectedPlant.plant.species ?? '');
    setDraftFertilizerMode(selectedPlant.care.fertilizerMode);
    setDraftSchedulingEnabled(selectedPlant.care.schedulingEnabled);
  }, [selectedPlant]);

  const plannerGroups = useMemo(
    () => (['WATERING', 'FERTILIZING'] as const)
      .map((careType) => {
        const items = plannerItems
          .filter((item) => item.careType === careType && item.status !== 'NOT_DUE')
          .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        return {
          careType,
          overdue: items.filter((item) => item.status === 'OVERDUE'),
          dueToday: items.filter((item) => item.status === 'DUE_TODAY'),
        };
      })
      .filter((group) => group.overdue.length > 0 || group.dueToday.length > 0),
    [plannerItems],
  );
  const dashboardSummary = useMemo(() => {
    const overdueCount = plannerItems.filter((item) => item.status === 'OVERDUE').length;
    const dueTodayCount = plannerItems.filter((item) => item.status === 'DUE_TODAY').length;
    return {
      totalPlants: plants.length,
      scheduledPlants: plants.filter(({ care }) => care.schedulingEnabled).length,
      overdueCount,
      dueTodayCount,
      totalTasks: plannerItems.length,
    };
  }, [plannerItems, plants]);
  const scheduledPlantCount = plants.filter(({ plant, care }) => !plant.archived && care.schedulingEnabled).length;
  const householdReady = Boolean(settings) && scheduledPlantCount > 0;

  const getPlantStatus = (plant: PlantRecord, care: PlantCareConfiguration) => {
    if (plant.archived) return { label: 'Archived', tone: styles.statusArchived };

    const plantTasks = plannerItems.filter((item) => item.plantId === plant.id);
    const overdueCount = plantTasks.filter((task) => task.status === 'OVERDUE').length;
    const dueTodayCount = plantTasks.filter((task) => task.status === 'DUE_TODAY').length;

    if (!care.schedulingEnabled) {
      return { label: 'Paused', tone: styles.statusPaused };
    }
    if (overdueCount > 0) {
      return { label: 'Needs attention', tone: styles.statusAttention };
    }
    if (dueTodayCount > 0) {
      return { label: 'Due today', tone: styles.statusToday };
    }
    return { label: 'On track', tone: styles.statusHealthy };
  };

  const collectionGroups = ([
    'Needs attention',
    'Due today',
    'On track',
    'Paused',
    'Archived',
  ] as const)
    .map((label) => ({
      label,
      plants: plants.filter(({ plant, care }) => getPlantStatus(plant, care).label === label),
    }))
    .filter((group) => group.plants.length > 0);

  const seasonalPlantCounts = { growing: 0, dormant: 0, yearRound: 0 };
  if (settings) {
    for (const { plant, care } of plants) {
      if (plant.archived || !care.schedulingEnabled) continue;

      const lookup = findPlantKnowledge({ genus: plant.genus, species: plant.species });
      if (lookup.status !== 'FOUND') continue;
      if (lookup.entry.seasonalModel === 'YEAR_ROUND') {
        seasonalPlantCounts.yearRound += 1;
        continue;
      }

      const season = lookup.entry.seasonFor(settings.climate, todayIso());
      seasonalPlantCounts[season === 'GROWING' ? 'growing' : 'dormant'] += 1;
    }
  }

  const householdStatusMessage = householdReady
    ? `Ready to care: ${scheduledPlantCount} plant${scheduledPlantCount === 1 ? '' : 's'} ${scheduledPlantCount === 1 ? 'has' : 'have'} an active schedule.`
    : plants.length > 0
      ? 'Enable a care schedule on a plant to start your routine.'
      : 'Add your first plant to complete setup.';

  const handleSaveSettings = async () => {
    if (!store) return;

    try {
      setErrorMessage(null);
      setStatusMessage('Saving household profile…');
      const nextSettings = await saveHouseholdSettings(
        { knowledgeLevel, commitmentLevel, city, country },
        store,
      );
      setSettings(nextSettings);
      setStatusMessage('Household profile saved.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save household settings.';
      setErrorMessage(message);
      setStatusMessage(null);
    }
  };

  const handleCreatePlant = async () => {
    if (!store) return;

    try {
      setErrorMessage(null);
      setStatusMessage('Creating plant…');
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
      setSelectedPlantId(created.plant.id);
      setDisplayName('');
      setGenus('');
      setSpecies('');
      setStatusMessage(`Added ${created.plant.displayName}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create plant.';
      setErrorMessage(message);
      setStatusMessage(null);
    }
  };

  const handleUpdatePlant = async () => {
    if (!store || !selectedPlant) return;

    try {
      setErrorMessage(null);
      setStatusMessage('Updating plant details…');
      const updated = await updatePlant(
        {
          id: selectedPlant.plant.id,
          displayName: draftPlantName,
          genus: draftPlantGenus,
          species: draftPlantSpecies.trim() || undefined,
          fertilizerMode: draftFertilizerMode,
          schedulingEnabled: draftSchedulingEnabled,
        },
        store,
      );
      await refreshPlants(store);
      setStatusMessage(`${updated.plant.displayName} updated.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update plant details.';
      setErrorMessage(message);
      setStatusMessage(null);
    }
  };

  const handleCareCompletion = async (plantId: string, careType: 'WATERING' | 'FERTILIZING') => {
    if (!store || plannerActionInFlight.current) return;
    plannerActionInFlight.current = true;
    setIsPlannerActionPending(true);

    try {
      setErrorMessage(null);
      setStatusMessage(`Recording ${careType.toLowerCase()}…`);
      await recordCareCompletion({ plantId, careType, today: todayIso() } as const, store);
      await refreshPlants(store);
      setStatusMessage(`${careType.toLowerCase()} recorded.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not complete care.';
      setErrorMessage(message);
      setStatusMessage(null);
    } finally {
      plannerActionInFlight.current = false;
      setIsPlannerActionPending(false);
    }
  };

  const handleScheduleAction = async (
    plantId: string,
    careType: 'WATERING' | 'FERTILIZING',
    action: { type: 'POSTPONE'; days: number } | { type: 'FEEDBACK_LATER' } | { type: 'FEEDBACK_EARLIER' },
  ) => {
    if (!store || plannerActionInFlight.current) return;
    plannerActionInFlight.current = true;
    setIsPlannerActionPending(true);

    try {
      setErrorMessage(null);
      const label = action.type === 'POSTPONE'
        ? `postponing ${careType.toLowerCase()} by ${action.days} days`
        : action.type === 'FEEDBACK_LATER'
          ? `marking ${careType.toLowerCase()} as later than expected`
          : `marking ${careType.toLowerCase()} as earlier than expected`;
      setStatusMessage(`Updating ${label}…`);
      await applyPlantScheduleAction(
        {
          plantId,
          action: { ...action, careType },
          today: todayIso(),
        },
        store,
      );
      await refreshPlants(store);
      setStatusMessage(`${careType.toLowerCase()} schedule updated.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update schedule.';
      setErrorMessage(message);
      setStatusMessage(null);
    } finally {
      plannerActionInFlight.current = false;
      setIsPlannerActionPending(false);
    }
  };

  const handlePlantLifecycleAction = async (
    plantId: string,
    action: 'archive' | 'restore' | 'delete',
  ) => {
    if (!store) return;

    try {
      setErrorMessage(null);
      if (action === 'archive') {
        setStatusMessage('Archiving plant…');
        await archivePlant(plantId, store);
      } else if (action === 'restore') {
        setStatusMessage('Restoring plant…');
        await restorePlant(plantId, store);
      } else {
        setStatusMessage('Deleting plant…');
        await deletePlant(plantId, store);
      }
      await refreshPlants(store);
      setStatusMessage(action === 'archive' ? 'Plant archived.' : action === 'restore' ? 'Plant restored.' : 'Plant deleted.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update plant.';
      setErrorMessage(message);
      setStatusMessage(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <StatusBar barStyle="dark-content" />

      <Text style={styles.title}>Plant Care</Text>
      {statusMessage ? <Text style={styles.notice}>{statusMessage}</Text> : null}
      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{settings ? 'Household profile' : 'Set up your home'}</Text>
        <Text style={styles.cardText}>
          Tell us where you keep your plants so care timing reflects your local climate.
        </Text>

        <Text style={styles.label}>Knowledge level</Text>
        <View style={styles.choiceGrid}>
          {knowledgeOptions.map((option) => (
            <Pressable
              key={option}
              style={[styles.choice, knowledgeLevel === option && styles.choiceSelected]}
              onPress={() => setKnowledgeLevel(option)}
            >
              <Text style={[styles.choiceText, knowledgeLevel === option && styles.choiceTextSelected]}>
                {option}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Commitment level</Text>
        <View style={styles.choiceGrid}>
          {commitmentOptions.map((option) => (
            <Pressable
              key={option}
              style={[styles.choice, commitmentLevel === option && styles.choiceSelected]}
              onPress={() => setCommitmentLevel(option)}
            >
              <Text style={[styles.choiceText, commitmentLevel === option && styles.choiceTextSelected]}>
                {option}
              </Text>
            </Pressable>
          ))}
        </View>

        <TextInput style={styles.input} placeholder="City" value={city} onChangeText={setCity} />
        <TextInput
          style={styles.input}
          placeholder="Country"
          value={country}
          onChangeText={setCountry}
        />
        <Button title={settings ? 'Update household' : 'Save household'} onPress={handleSaveSettings} />

        {settings ? (
          <View style={styles.summaryBox}>
            <Text style={styles.summaryTitle}>Climate</Text>
            <Text>
              {settings.climate} ({settings.climateUsedFallback ? 'estimated' : 'resolved'})
            </Text>
          </View>
        ) : null}
      </View>

      {settings ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Daily care overview</Text>
          <View style={styles.summaryGrid}>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Plants</Text>
              <Text style={styles.metricValue}>{dashboardSummary.totalPlants}</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Scheduled</Text>
              <Text style={styles.metricValue}>{dashboardSummary.scheduledPlants}</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Due today</Text>
              <Text style={styles.metricValue}>{dashboardSummary.dueTodayCount}</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Overdue</Text>
              <Text style={styles.metricValue}>{dashboardSummary.overdueCount}</Text>
            </View>
          </View>
          <Text style={styles.statusNote}>
            {householdStatusMessage}
          </Text>
          <Text style={styles.muted}>
            {scheduledPlantCount === 0
              ? 'Add an active care schedule to see seasonal guidance.'
              : `Seasonal care: ${seasonalPlantCounts.growing} plant${seasonalPlantCounts.growing === 1 ? '' : 's'} currently use growing-season intervals, ${seasonalPlantCounts.dormant} use dormant-season intervals, and ${seasonalPlantCounts.yearRound} use year-round guidance.`}
          </Text>
        </View>
      ) : null}

      {settings ? (
        <View style={styles.card}>
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
        </View>
      ) : (
        <Text style={styles.muted}>Complete household setup to add your first plant.</Text>
      )}

      <Text style={styles.sectionTitle}>Plant collection</Text>
      {plants.length === 0 ? (
        <Text style={styles.muted}>No plants yet. Add your first plant to begin.</Text>
      ) : (
        collectionGroups.map((group) => (
          <View key={group.label}>
            <Text style={styles.groupTitle}>{group.label} ({group.plants.length})</Text>
            {group.plants.map(({ plant, care }) => {
              const plantTasks = plannerItems.filter((item) => item.plantId === plant.id);
              const dueCount = plantTasks.filter((item) => item.status !== 'NOT_DUE').length;
              const status = getPlantStatus(plant, care);
              return (
                <Pressable
                  key={plant.id}
                  style={[styles.card, selectedPlantId === plant.id && styles.cardSelected]}
                  onPress={() => setSelectedPlantId(plant.id)}
                >
                  <View style={styles.collectionHeader}>
                    <Text style={styles.cardTitle}>{plant.displayName}</Text>
                    <Text style={[styles.statusBadge, status.tone]}>{status.label}</Text>
                  </View>
                  <Text>{plant.genus}{plant.species ? ` • ${plant.species}` : ''}</Text>
                  <Text>{care.schedulingEnabled ? 'Scheduling enabled' : 'Scheduling disabled'}</Text>
                  <Text style={styles.inlineStatus}>{dueCount > 0 ? `${dueCount} task(s) due` : 'All clear'}</Text>
                </Pressable>
              );
            })}
          </View>
        ))
      )}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Daily planner</Text>
        {plannerGroups.length === 0 ? (
          <Text style={styles.muted}>Everything is on track. No care items are due right now.</Text>
        ) : (
          plannerGroups.map((group) => (
            <View key={group.careType} style={styles.taskGroup}>
              <Text style={styles.groupTitle}>
                {group.careType === 'WATERING' ? 'Watering' : 'Fertilizing'}
              </Text>
              {(['OVERDUE', 'DUE_TODAY'] as const).map((status) => {
                const items = status === 'OVERDUE' ? group.overdue : group.dueToday;
                if (items.length === 0) return null;

                return (
                  <View key={status} style={styles.taskGroup}>
                    <Text style={styles.groupTitle}>
                      {status === 'OVERDUE' ? 'Overdue' : 'Due today'}
                    </Text>
                    {items.map((item) => {
                      const taskKey = `${item.plantId}-${item.careType}`;
                      const customDays = customPostponementDays[taskKey] ?? '';
                      const customDaysValid = isValidCustomPostponementDays(
                        customDays,
                        item.effectiveIntervalDays,
                      );

                      return (
                        <View key={taskKey} style={styles.taskRow}>
                          <View style={styles.taskHeaderRow}>
                            <Text style={styles.cardTitle}>{item.plantName}</Text>
                            <Text style={[styles.pill, status === 'OVERDUE' ? styles.pillOverdue : styles.pillToday]}>
                              {status === 'OVERDUE' ? 'Overdue' : 'Due today'}
                            </Text>
                          </View>
                          <Text>{item.dueDate}</Text>
                          <View style={styles.actionRow}>
                            <Button
                              title="Complete"
                              disabled={isPlannerActionPending}
                              onPress={() => handleCareCompletion(item.plantId, item.careType)}
                            />
                            {getPostponementQuickChoices(item.effectiveIntervalDays).map((days) => (
                              <Button
                                key={days}
                                title={`Postpone ${days}d`}
                                disabled={isPlannerActionPending}
                                onPress={() => handleScheduleAction(item.plantId, item.careType, { type: 'POSTPONE', days })}
                              />
                            ))}
                            <Button
                              title="Later"
                              disabled={isPlannerActionPending}
                              onPress={() => handleScheduleAction(item.plantId, item.careType, { type: 'FEEDBACK_LATER' })}
                            />
                            <Button
                              title="Earlier"
                              disabled={isPlannerActionPending}
                              onPress={() => handleScheduleAction(item.plantId, item.careType, { type: 'FEEDBACK_EARLIER' })}
                            />
                          </View>
                          <Text style={styles.label}>
                            Custom postponement (maximum {item.effectiveIntervalDays} days)
                          </Text>
                          <TextInput
                            style={styles.input}
                            placeholder="Days"
                            value={customDays}
                            keyboardType="number-pad"
                            onChangeText={(value) => setCustomPostponementDays((current) => ({
                              ...current,
                              [taskKey]: value,
                            }))}
                          />
                          <Text style={styles.muted}>
                            {customDaysValid
                              ? `Valid postponement: ${customDays} days.`
                              : `Enter a whole number from 1 to ${item.effectiveIntervalDays} days.`}
                          </Text>
                          <Button
                            title="Postpone custom"
                            disabled={!customDaysValid || isPlannerActionPending}
                            onPress={() => handleScheduleAction(
                              item.plantId,
                              item.careType,
                              { type: 'POSTPONE', days: Number(customDays) },
                            )}
                          />
                        </View>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          ))
        )}
      </View>

      {selectedPlant ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Plant detail</Text>
          <Text style={styles.cardTitle}>{selectedPlant.plant.displayName}</Text>
          <Text>{selectedPlant.plant.genus}{selectedPlant.plant.species ? ` • ${selectedPlant.plant.species}` : ''}</Text>
          <Text style={styles.inlineStatus}>Taxonomic level: {selectedPlant.plant.taxonomicLevel}</Text>
          <Text style={styles.inlineStatus}>Scheduling: {selectedPlant.care.schedulingEnabled ? 'enabled' : 'disabled'}</Text>

          <View style={styles.editSection}>
            <Text style={styles.summaryTitle}>Edit plant</Text>
            <TextInput
              style={styles.input}
              placeholder="Plant name"
              value={draftPlantName}
              onChangeText={setDraftPlantName}
            />
            <TextInput
              style={styles.input}
              placeholder="Genus"
              value={draftPlantGenus}
              onChangeText={setDraftPlantGenus}
            />
            <TextInput
              style={styles.input}
              placeholder="Species"
              value={draftPlantSpecies}
              onChangeText={setDraftPlantSpecies}
            />

            <Text style={styles.label}>Fertilizer mode</Text>
            <View style={styles.choiceGrid}>
              {(['NONE', 'LIQUID', 'LONG_TERM'] as const).map((mode) => (
                <Pressable
                  key={mode}
                  style={[styles.choice, draftFertilizerMode === mode && styles.choiceSelected]}
                  onPress={() => setDraftFertilizerMode(mode)}
                >
                  <Text style={[styles.choiceText, draftFertilizerMode === mode && styles.choiceTextSelected]}>
                    {mode.toLowerCase()}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.switchRow}>
              <Text>Enable scheduling</Text>
              <Switch value={draftSchedulingEnabled} onValueChange={setDraftSchedulingEnabled} />
            </View>

            <Button title="Save plant details" onPress={handleUpdatePlant} />
          </View>

          <View style={styles.actionRow}>
            {selectedPlant.plant.archived ? (
              <Button title="Restore plant" onPress={() => handlePlantLifecycleAction(selectedPlant.plant.id, 'restore')} />
            ) : (
              <Button title="Archive plant" onPress={() => handlePlantLifecycleAction(selectedPlant.plant.id, 'archive')} />
            )}
            <Button title="Delete plant" color="#b42318" onPress={() => handlePlantLifecycleAction(selectedPlant.plant.id, 'delete')} />
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingTop: 72,
    paddingBottom: 48,
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
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    borderColor: '#dfe9df',
    borderWidth: 1,
  },
  cardSelected: {
    borderColor: '#1f7a4d',
    backgroundColor: '#f3faf6',
  },
  cardText: {
    color: '#5a6a5e',
    marginBottom: 12,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  metricBox: {
    flexBasis: '48%',
    backgroundColor: '#f3faf6',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#dfe9df',
  },
  metricLabel: {
    color: '#5a6a5e',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricValue: {
    marginTop: 6,
    fontSize: 26,
    fontWeight: '700',
    color: '#1f7a4d',
  },
  statusNote: {
    marginTop: 12,
    color: '#34543c',
    fontWeight: '600',
  },
  collectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
  },
  statusAttention: {
    backgroundColor: '#fdecea',
    color: '#b42318',
  },
  statusToday: {
    backgroundColor: '#edf7f0',
    color: '#1f7a4d',
  },
  statusHealthy: {
    backgroundColor: '#e8f6ef',
    color: '#1f7a4d',
  },
  statusPaused: {
    backgroundColor: '#f4f4f5',
    color: '#475467',
  },
  statusArchived: {
    backgroundColor: '#f0f1f2',
    color: '#344054',
  },
  label: {
    fontWeight: '600',
    marginBottom: 8,
  },
  choiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  choice: {
    borderWidth: 1,
    borderColor: '#dfe9df',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f5f7f3',
    marginRight: 8,
    marginBottom: 8,
  },
  choiceSelected: {
    backgroundColor: '#1f7a4d',
    borderColor: '#1f7a4d',
  },
  choiceText: {
    color: '#1f2a1f',
    textTransform: 'capitalize',
    fontWeight: '600',
  },
  choiceTextSelected: {
    color: '#fff',
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
  summaryBox: {
    backgroundColor: '#edf7f0',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  summaryTitle: {
    fontWeight: '700',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  taskHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '700',
    overflow: 'hidden',
  },
  pillOverdue: {
    backgroundColor: '#fdecea',
    color: '#b42318',
  },
  pillToday: {
    backgroundColor: '#edf7f0',
    color: '#1f7a4d',
  },
  inlineStatus: {
    marginTop: 6,
    color: '#34543c',
  },
  editSection: {
    marginTop: 18,
    paddingTop: 6,
  },
  detailBlock: {
    marginTop: 18,
  },
  taskGroup: {
    marginTop: 12,
  },
  groupTitle: {
    fontWeight: '700',
    marginBottom: 6,
  },
  taskRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#edf1ee',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  muted: {
    color: '#5a6a5e',
    marginTop: 8,
  },
  notice: {
    backgroundColor: '#edf7f0',
    color: '#1f7a4d',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  error: {
    backgroundColor: '#fdecea',
    color: '#b42318',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
});
