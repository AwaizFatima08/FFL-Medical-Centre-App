// app/src/screens/reports/TripDayReportScreen.js
// Phase 10 redesign — Trip Day Report. Any single date, past or future.
// Reception, admin_incharge, doctor, CMO: view + PDF download (all four).

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { API } from '../../config/api';
import { downloadFile } from '../../utils/downloadFile';
import DatePickerField from '../../components/DatePickerField';

const toDateStr = (d) => (d instanceof Date ? d.toISOString().split('T')[0] : d);

export default function TripDayReportScreen({ navigation, route }) {
  const userRole = route.params?.userRole || '';

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error,      setError]      = useState('');

  // Filters — narrow within the selected day only, per PHASE10_DESIGN.md
  const [empNumFilter, setEmpNumFilter] = useState('');
  const [empNameFilter, setEmpNameFilter] = useState('');
  const [doctorFilter, setDoctorFilter] = useState('');
  const [hospitalFilter, setHospitalFilter] = useState('');

  const getToken = async () => {
    const auth = getAuth();
    return await auth.currentUser.getIdToken();
  };

  const fetchReport = async (dateForQuery) => {
    setError('');
    try {
      const token    = await getToken();
      const dateStr  = toDateStr(dateForQuery);
      const response = await fetch(`${API.reports}/trip-day?date=${dateStr}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const json = await response.json();
      if (response.ok) setData(json.data);
      else setError(json.message || 'Failed to load report.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchReport(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []));

  const onSelectDate = (d) => {
    setSelectedDate(d);
    setLoading(true);
    fetchReport(d);
  };

  const onRefresh = () => { setRefreshing(true); fetchReport(selectedDate); };

  const handleDownloadPDF = async () => {
    setPdfLoading(true);
    try {
      const dateStr = toDateStr(selectedDate);
      await downloadFile(
        `${API.reports}/trip-day?date=${dateStr}&format=pdf`,
        `trip-report-${dateStr}.pdf`
      );
    } catch {
      setError('Failed to download PDF.');
    } finally {
      setPdfLoading(false);
    }
  };

  const bookings = data?.bookings || [];

  const filtered = bookings.filter(b => {
    if (empNumFilter.trim() &&
      !b.employeeNumber?.toLowerCase().includes(empNumFilter.trim().toLowerCase())
    ) return false;
    if (empNameFilter.trim() &&
      !b.employeeName?.toLowerCase().includes(empNameFilter.trim().toLowerCase())
    ) return false;
    if (doctorFilter.trim() &&
      !b.doctorName?.toLowerCase().includes(doctorFilter.trim().toLowerCase())
    ) return false;
    if (hospitalFilter.trim() &&
      !b.hospital?.toLowerCase().includes(hospitalFilter.trim().toLowerCase())
    ) return false;
    return true;
  });

  const dateStr = toDateStr(selectedDate);

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Trip Day Report</Text>
        <Text style={styles.subtitle}>{dateStr} · Departure 17:30</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Any date — past or future */}
        <DatePickerField
          label="Trip Date"
          value={selectedDate}
          onChange={onSelectDate}
        />
        <TouchableOpacity
          style={styles.todayBtn}
          onPress={() => onSelectDate(new Date())}
        >
          <Text style={styles.todayBtnText}>Reset to Today</Text>
        </TouchableOpacity>

        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
          </View>
        )}

        {loading ? (
          <View style={styles.centeredInline}>
            <ActivityIndicator size="large" color="#3182ce" />
            <Text style={styles.loadingText}>Loading report...</Text>
          </View>
        ) : data && (
          <>
            {/* Summary strip */}
            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>{data.bookedSeats || 0}</Text>
                <Text style={styles.summaryLabel}>Confirmed</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>{data.totalSeats || 24}</Text>
                <Text style={styles.summaryLabel}>Total Seats</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>
                  {(data.totalSeats || 24) - (data.bookedSeats || 0)}
                </Text>
                <Text style={styles.summaryLabel}>Available</Text>
              </View>
            </View>

            {/* PDF — available to every role with access to this report */}
            <TouchableOpacity
              style={[styles.pdfBtn, pdfLoading && styles.btnDisabled]}
              onPress={handleDownloadPDF}
              disabled={pdfLoading}
            >
              {pdfLoading
                ? <ActivityIndicator size="small" color="#ffffff" />
                : <Text style={styles.pdfBtnText}>📄 Download PDF</Text>
              }
            </TouchableOpacity>

            {/* Filters — narrow within this day only */}
            <TextInput
              style={styles.searchInput}
              value={empNumFilter}
              onChangeText={setEmpNumFilter}
              placeholder="Filter by employee number..."
              placeholderTextColor="#a0aec0"
            />
            <TextInput
              style={styles.searchInput}
              value={empNameFilter}
              onChangeText={setEmpNameFilter}
              placeholder="Filter by employee name..."
              placeholderTextColor="#a0aec0"
            />
            <TextInput
              style={styles.searchInput}
              value={doctorFilter}
              onChangeText={setDoctorFilter}
              placeholder="Filter by visiting doctor..."
              placeholderTextColor="#a0aec0"
            />
            <TextInput
              style={styles.searchInput}
              value={hospitalFilter}
              onChangeText={setHospitalFilter}
              placeholder="Filter by hospital..."
              placeholderTextColor="#a0aec0"
            />

            {/* Booking list */}
            {filtered.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🚌</Text>
                <Text style={styles.emptyText}>
                  {bookings.length === 0
                    ? 'No confirmed bookings for this date'
                    : 'No bookings match this filter'}
                </Text>
              </View>
            ) : (
              filtered.map((b, i) => (
                <View key={b.id || i} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardNumber}>{i + 1}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardName}>{b.patientName || '—'}</Text>
                      <Text style={styles.cardSub}>
                        {b.patientRelation || '—'} · {b.employeeName || '—'} [{b.employeeNumber || '—'}]
                      </Text>
                    </View>
                    <View style={styles.badgeCol}>
                      {b.referralConfirmed && (
                        <View style={styles.referralBadge}>
                          <Text style={styles.referralBadgeText}>Referral</Text>
                        </View>
                      )}
                      {b.returnTrip && (
                        <View style={styles.returnBadge}>
                          <Text style={styles.returnBadgeText}>↩ Return</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <View style={styles.cardGrid}>
                    <InfoItem icon="🏠" label="Pickup"   value={b.pickupHouse || '—'} />
                    <InfoItem icon="📞" label="Phone"    value={b.phone || b.employeePhoneNumber || '—'} />
                    <InfoItem icon="🩺" label="Doctor"   value={b.doctorName || '—'} />
                    <InfoItem icon="🏥" label="Hospital" value={b.hospital || '—'} />
                    <InfoItem icon="📋" label="Referral" value={b.referralConfirmed ? 'Yes' : 'No'} />
                    <InfoItem icon="↩️" label="Return"   value={b.returnTrip ? 'Yes' : 'No'} />
                  </View>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function InfoItem({ icon, label, value }) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoIcon}>{icon}</Text>
      <View>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#f0f4f8' },
  header: {
    paddingTop: 48, paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  backBtn:     { marginBottom: 6 },
  backText:    { fontSize: 14, color: '#3182ce', fontWeight: '600' },
  title:       { fontSize: 20, fontWeight: 'bold', color: '#2d3748' },
  subtitle:    { fontSize: 13, color: '#718096', marginTop: 2 },
  centeredInline: { alignItems: 'center', gap: 12, paddingVertical: 40 },
  loadingText: { fontSize: 14, color: '#718096' },
  scroll:        { flex: 1 },
  scrollContent: { padding: 16, gap: 12 },
  errorBox: {
    backgroundColor: '#fff5f5', borderRadius: 8, padding: 12,
    borderLeftWidth: 3, borderLeftColor: '#fc8181',
  },
  errorText: { fontSize: 13, color: '#c53030' },
  todayBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8,
    backgroundColor: '#ebf8ff', borderWidth: 1, borderColor: '#90cdf4',
  },
  todayBtnText: { fontSize: 13, color: '#2b6cb0', fontWeight: '600' },
  summaryRow: { flexDirection: 'row', gap: 12 },
  summaryCard: {
    flex: 1, backgroundColor: '#ffffff', borderRadius: 10,
    padding: 14, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },
  summaryValue: { fontSize: 24, fontWeight: '800', color: '#2b6cb0' },
  summaryLabel: { fontSize: 12, color: '#718096', marginTop: 2 },
  pdfBtn: {
    backgroundColor: '#276749', borderRadius: 8,
    paddingVertical: 12, alignItems: 'center',
  },
  pdfBtnText:  { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
  searchInput: {
    backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#e2e8f0',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#2d3748',
  },
  card: {
    backgroundColor: '#ffffff', borderRadius: 10, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },
  cardHeader:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  cardNumber: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#ebf8ff', alignItems: 'center',
    justifyContent: 'center',
  },
  cardName:    { fontSize: 14, fontWeight: '700', color: '#2d3748' },
  cardSub:     { fontSize: 12, color: '#718096', marginTop: 1 },
  badgeCol:    { gap: 4, alignItems: 'flex-end' },
  returnBadge: {
    backgroundColor: '#faf5ff', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: '#d6bcfa',
  },
  returnBadgeText: { fontSize: 11, color: '#6b46c1', fontWeight: '600' },
  referralBadge: {
    backgroundColor: '#ebf8ff', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: '#90cdf4',
  },
  referralBadgeText: { fontSize: 11, color: '#2b6cb0', fontWeight: '600' },
  cardGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  infoItem:  { flexDirection: 'row', alignItems: 'center', width: '47%', gap: 6 },
  infoIcon:  { fontSize: 14 },
  infoLabel: { fontSize: 10, color: '#a0aec0', fontWeight: '600' },
  infoValue: { fontSize: 12, color: '#2d3748', fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyIcon:  { fontSize: 48 },
  emptyText:  { fontSize: 14, color: '#a0aec0' },
});