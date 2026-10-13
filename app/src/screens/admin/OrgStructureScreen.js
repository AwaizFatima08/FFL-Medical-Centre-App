// app/src/screens/admin/OrgStructureScreen.js
// Admin editor for departments, units and designations. Every change goes
// through POST /employees/org-structure, which returns the full updated
// structure; the shared cache is refreshed from that response so the
// approval/profile screens pick it up without another read.

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator,
} from 'react-native';
import { auth } from '../../config/firebase';
import { API } from '../../config/api';
import { EMPLOYEE_TYPES } from '../../constants';
import { webAlert, webConfirm } from '../../utils/webAlert';
import NotificationBell from '../../components/NotificationBell';
import {
  useOrgStructure, loadOrgStructure, setOrgStructure, ESB_DEPARTMENT,
} from '../../utils/orgStructure';

const TABS = [
  { key: 'department',  label: 'Departments' },
  { key: 'unit',        label: 'Units' },
  { key: 'designation', label: 'Designations' },
];

const EMPLOYEE_TYPE_TABS = [
  { label: 'Management',     value: EMPLOYEE_TYPES.MANAGEMENT },
  { label: 'Non-Management', value: EMPLOYEE_TYPES.NON_MANAGEMENT },
  { label: 'ESB',            value: EMPLOYEE_TYPES.ESB },
];

const ADDABLE_GROUPS = ['PLANT', 'HO'];

// Active entries first, archived after, each in their saved order.
const sortForDisplay = (list) =>
  [...(list || [])].sort((a, b) => Number(!!a.archived) - Number(!!b.archived));

export default function OrgStructureScreen({ navigation }) {
  const structure = useOrgStructure();
  const [tab, setTab] = useState('department');
  const [refreshing, setRefreshing] = useState(true);
  const [busyKey, setBusyKey] = useState(null);

  const [selectedDept, setSelectedDept] = useState(null);
  const [selectedType, setSelectedType] = useState(EMPLOYEE_TYPES.MANAGEMENT);
  const [newLabel, setNewLabel] = useState('');
  const [newGroup, setNewGroup] = useState('PLANT');
  const [renaming, setRenaming] = useState(null);   // { value, label }

  useEffect(() => {
    loadOrgStructure({ force: true }).finally(() => setRefreshing(false));
  }, []);

  const unitDepartments = useMemo(
    () => structure.departments.filter(d => d.value !== ESB_DEPARTMENT),
    [structure],
  );
  const activeDept = selectedDept || unitDepartments[0]?.value;

  // Scope fields every request needs for the current tab.
  const scope = () => {
    if (tab === 'unit') return { department: activeDept };
    if (tab === 'designation') return { employeeType: selectedType };
    return {};
  };

  const mutate = async (payload, key) => {
    setBusyKey(key);
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch(`${API.employees}/org-structure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ kind: tab, ...scope(), ...payload }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setOrgStructure(json.data.structure);
      return { ok: res.ok, status: res.status, json };
    } catch {
      webAlert('Network error', 'Please check your connection and try again.');
      return { ok: false, status: 0, json: {} };
    } finally {
      setBusyKey(null);
    }
  };

  const handleAdd = async () => {
    const label = newLabel.trim();
    if (!label) { webAlert('Name required', 'Type a name to add.'); return; }
    const r = await mutate({ op: 'add', label, ...(tab === 'department' ? { group: newGroup } : {}) }, 'add');
    if (r.ok) setNewLabel('');
    else if (r.status) webAlert('Could not add', r.json.message || 'Please try again.');
  };

  const handleRename = async () => {
    const label = renaming.label.trim();
    if (!label) { webAlert('Name required', 'The name cannot be empty.'); return; }
    const r = await mutate({ op: 'rename', value: renaming.value, label }, renaming.value);
    if (r.ok) setRenaming(null);
    else if (r.status) webAlert('Could not rename', r.json.message || 'Please try again.');
  };

  const handleArchiveToggle = async (item) => {
    const r = await mutate({ op: item.archived ? 'restore' : 'archive', value: item.value }, item.value);
    if (!r.ok && r.status) webAlert('Could not update', r.json.message || 'Please try again.');
  };

  const handleDelete = (item) => {
    webConfirm(
      `Delete "${item.label}"?`,
      'This cannot be undone. If any employee record still uses it, you will be offered to archive it instead.',
      async () => {
        const r = await mutate({ op: 'delete', value: item.value }, item.value);
        if (r.ok || !r.status) return;
        if (r.status === 409 && r.json.data?.inUse) {
          webConfirm(
            'Still in use',
            `${r.json.message}\n\nArchive "${item.label}" now?`,
            () => handleArchiveToggle(item),
            false,
            'Archive',
          );
        } else {
          webAlert('Could not delete', r.json.message || 'Please try again.');
        }
      },
      true,
      'Delete',
    );
  };

  const renderItem = (item) => {
    const isBusy = busyKey === item.value;
    const isRenaming = renaming?.value === item.value;
    return (
      <View key={item.value} style={[styles.row, item.archived && styles.rowArchived]}>
        {isRenaming ? (
          <View style={styles.renameBox}>
            <TextInput
              style={styles.input}
              value={renaming.label}
              onChangeText={(t) => setRenaming(r => ({ ...r, label: t }))}
              autoFocus
              maxLength={60}
              onSubmitEditing={handleRename}
            />
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.btnPrimary} onPress={handleRename} disabled={isBusy}>
                {isBusy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnPrimaryText}>Save</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnGhost} onPress={() => setRenaming(null)}>
                <Text style={styles.btnGhostText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, item.archived && styles.rowLabelArchived]}>{item.label}</Text>
              <View style={styles.badgeRow}>
                {item.archived && <Text style={[styles.badge, styles.badgeArchived]}>Archived</Text>}
                {item.locked && <Text style={[styles.badge, styles.badgeLocked]}>Required</Text>}
              </View>
            </View>
            {isBusy ? (
              <ActivityIndicator color="#3b82f6" />
            ) : (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.btnSmall}
                  onPress={() => setRenaming({ value: item.value, label: item.label })}
                  accessibilityLabel={`Rename ${item.label}`}
                >
                  <Text style={styles.btnSmallText}>Rename</Text>
                </TouchableOpacity>
                {!item.locked && (
                  <>
                    <TouchableOpacity style={styles.btnSmall} onPress={() => handleArchiveToggle(item)}>
                      <Text style={styles.btnSmallText}>{item.archived ? 'Restore' : 'Archive'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.btnSmall, styles.btnDanger]} onPress={() => handleDelete(item)}>
                      <Text style={styles.btnDangerText}>Delete</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}
          </>
        )}
      </View>
    );
  };

  const renderChips = (options, selected, onSelect) => (
    <View style={styles.chipWrap}>
      {options.map(o => (
        <TouchableOpacity
          key={o.value}
          style={[styles.chip, selected === o.value && styles.chipSelected, o.archived && styles.chipArchived]}
          onPress={() => { onSelect(o.value); setRenaming(null); }}
        >
          <Text style={[styles.chipText, selected === o.value && styles.chipTextSelected]}>{o.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const addPlaceholder = {
    department:  'New department name',
    unit:        `New unit in ${structure.departments.find(d => d.value === activeDept)?.label || 'department'}`,
    designation: 'New designation, e.g. Senior Engineer (M-9)',
  }[tab];

  const renderAddForm = () => (
    <View style={styles.addBox}>
      <Text style={styles.sectionTitle}>Add new</Text>
      <TextInput
        style={styles.input}
        placeholder={addPlaceholder}
        placeholderTextColor="#a0aec0"
        value={newLabel}
        onChangeText={setNewLabel}
        maxLength={60}
        onSubmitEditing={handleAdd}
      />
      {tab === 'department' && (
        <View style={styles.chipWrap}>
          {structure.departmentGroups.filter(g => ADDABLE_GROUPS.includes(g.key)).map(g => (
            <TouchableOpacity
              key={g.key}
              style={[styles.chip, newGroup === g.key && styles.chipSelected]}
              onPress={() => setNewGroup(g.key)}
            >
              <Text style={[styles.chipText, newGroup === g.key && styles.chipTextSelected]}>{g.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <TouchableOpacity
        style={[styles.btnPrimary, styles.btnWide, busyKey === 'add' && styles.btnBusy]}
        onPress={handleAdd}
        disabled={busyKey === 'add'}
      >
        {busyKey === 'add'
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={styles.btnPrimaryText}>Add</Text>}
      </TouchableOpacity>
    </View>
  );

  const renderTabBody = () => {
    if (tab === 'department') {
      return structure.departmentGroups.map(g => {
        const items = sortForDisplay(structure.departments.filter(d => d.group === g.key));
        if (items.length === 0) return null;
        return (
          <View key={g.key} style={styles.card}>
            <Text style={styles.sectionTitle}>{g.label}</Text>
            {items.map(renderItem)}
          </View>
        );
      });
    }
    if (tab === 'unit') {
      const units = sortForDisplay(structure.units?.[activeDept]);
      return (
        <>
          <Text style={styles.pickLabel}>Department</Text>
          {renderChips(unitDepartments, activeDept, setSelectedDept)}
          <View style={styles.card}>
            {units.length === 0
              ? <Text style={styles.emptyText}>No units yet — add one below.</Text>
              : units.map(renderItem)}
          </View>
        </>
      );
    }
    const designations = sortForDisplay(structure.designations?.[selectedType]);
    return (
      <>
        <Text style={styles.pickLabel}>Employee type</Text>
        {renderChips(EMPLOYEE_TYPE_TABS, selectedType, setSelectedType)}
        <View style={styles.card}>
          {designations.length === 0
            ? <Text style={styles.emptyText}>No designations yet — add one below.</Text>
            : designations.map(renderItem)}
        </View>
      </>
    );
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Departments & Designations</Text>
        <NotificationBell navigation={navigation} />
      </View>

      <View style={styles.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            onPress={() => { setTab(t.key); setRenaming(null); setNewLabel(''); }}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.help}>
          Changes apply straight away in User Approvals, Manage Users and My Profile.
          Archived entries stay on existing employee records but can't be chosen for new ones.
          Delete is only allowed when no employee uses the entry.
        </Text>
        {refreshing && <ActivityIndicator color="#3b82f6" style={{ marginBottom: 12 }} />}
        {renderTabBody()}
        {renderAddForm()}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#f0f4f8' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20,
    backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  backBtn:     { paddingRight: 8 },
  backText:    { fontSize: 15, color: '#3b82f6', fontWeight: '500' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: 'bold', color: '#2d3748', textAlign: 'center' },

  tabBar: {
    flexDirection: 'row', backgroundColor: '#ffffff',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  tab:           { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive:     { borderBottomColor: '#2563eb' },
  tabText:       { fontSize: 13, color: '#718096', fontWeight: '600' },
  tabTextActive: { color: '#1d4ed8' },

  container: { padding: 16, width: '100%', maxWidth: 720, alignSelf: 'center' },
  help:      { fontSize: 12, color: '#718096', lineHeight: 18, marginBottom: 14 },

  card: {
    backgroundColor: '#ffffff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8,
    marginBottom: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#4a5568', marginTop: 6, marginBottom: 6 },
  pickLabel:    { fontSize: 12, fontWeight: '600', color: '#4a5568', marginBottom: 8 },
  emptyText:    { fontSize: 13, color: '#a0aec0', paddingVertical: 12 },

  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap',
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#edf2f7', gap: 8,
  },
  rowArchived:      { opacity: 0.6 },
  rowText:          { flexGrow: 1, flexShrink: 1, minWidth: 140 },
  rowLabel:         { fontSize: 14, color: '#2d3748', fontWeight: '600' },
  rowLabelArchived: { textDecorationLine: 'line-through' },
  badgeRow:         { flexDirection: 'row', gap: 6, marginTop: 3 },
  badge:            { fontSize: 10, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  badgeArchived:    { backgroundColor: '#edf2f7', color: '#4a5568' },
  badgeLocked:      { backgroundColor: '#ebf8ff', color: '#2b6cb0' },

  actionRow:     { flexDirection: 'row', gap: 6, alignItems: 'center' },
  btnSmall:      { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e0', backgroundColor: '#ffffff' },
  btnSmallText:  { fontSize: 12, color: '#2d3748', fontWeight: '600' },
  btnDanger:     { borderColor: '#feb2b2', backgroundColor: '#fff5f5' },
  btnDangerText: { fontSize: 12, color: '#c53030', fontWeight: '600' },

  renameBox: { flex: 1, gap: 8 },
  input: {
    borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
    color: '#1e293b', backgroundColor: '#ffffff',
  },
  btnPrimary:     { backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 9, paddingHorizontal: 16, alignItems: 'center' },
  btnPrimaryText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  btnWide:        { marginTop: 10, paddingVertical: 12 },
  btnBusy:        { opacity: 0.6 },
  btnGhost:       { paddingVertical: 9, paddingHorizontal: 12 },
  btnGhostText:   { color: '#718096', fontSize: 13, fontWeight: '600' },

  addBox: {
    backgroundColor: '#ffffff', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#bfdbfe', borderStyle: 'dashed',
  },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12, marginTop: 4 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#e2e8f0', backgroundColor: '#f7fafc',
  },
  chipSelected:     { borderColor: '#3b82f6', backgroundColor: '#eff6ff' },
  chipArchived:     { opacity: 0.55 },
  chipText:         { fontSize: 12, color: '#4a5568', fontWeight: '500' },
  chipTextSelected: { color: '#1d4ed8', fontWeight: '700' },
});
