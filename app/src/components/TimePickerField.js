// app/src/components/TimePickerField.js
//
// Phase 9 — companion to DatePickerField.js, same web/native split pattern.
// Unlike DatePickerField, the value here is a plain 'HH:MM' 24-hour string
// (e.g. '14:30') rather than a JS Date — that matches how visitTime is
// already stored and submitted throughout the Feedback module (see
// FeedbackFormScreen.js), so callers don't need to convert anything. A
// JS Date is only ever constructed internally, to feed the native picker.
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

const IS_WEB = Platform.OS === 'web';

const TimePickerField = ({ label, value, onChange }) => {
  const [show, setShow] = useState(false);

  // 'HH:MM' string -> Date, only for feeding the native picker
  const toDate = (timeStr) => {
    const d = new Date();
    if (timeStr) {
      const [h, m] = timeStr.split(':').map(Number);
      d.setHours(h || 0, m || 0, 0, 0);
    }
    return d;
  };

  // Date -> 'HH:MM' string, local time (not UTC — same timezone-safety
  // reasoning as DatePickerField's toInputValue)
  const toTimeString = (date) => {
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  const handleChange = (event, selectedDate) => {
    setShow(Platform.OS === 'ios');
    if (selectedDate) {
      onChange(toTimeString(selectedDate));
    }
  };

  // Display formatting for the native touch target, e.g. '2:30 PM'
  const formatDisplay = (timeStr) => {
    if (!timeStr) return 'Select time';
    const [h, m] = timeStr.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
  };

  if (IS_WEB) {
    return (
      <View style={styles.container}>
        {label && <Text style={styles.label}>{label}</Text>}
        {React.createElement('input', {
          type: 'time',
          value: value || '',
          onChange: (e) => {
            if (e.target.value) onChange(e.target.value);
          },
          style: webInputStyle,
        })}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TouchableOpacity style={styles.input} onPress={() => setShow(true)}>
        <Text style={value ? styles.timeText : styles.placeholder}>
          {formatDisplay(value)}
        </Text>
      </TouchableOpacity>
      {show && (
        <DateTimePicker
          value={toDate(value)}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'clock'}
          onChange={handleChange}
        />
      )}
    </View>
  );
};

const webInputStyle = {
  borderWidth: 1,
  borderColor: '#ddd',
  borderRadius: 8,
  padding: 12,
  backgroundColor: '#fff',
  fontSize: 14,
  color: '#333',
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
};

const styles = StyleSheet.create({
  container: { marginBottom: 15 },
  label: { fontSize: 14, color: '#555', marginBottom: 5, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
  },
  timeText: { fontSize: 14, color: '#333' },
  placeholder: { fontSize: 14, color: '#aaa' },
});

export default TimePickerField;