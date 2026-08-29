import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

const IS_WEB = Platform.OS === 'web';

const DatePickerField = ({ label, value, onChange, maximumDate, minimumDate }) => {
  const [show, setShow] = useState(false);

  const handleChange = (event, selectedDate) => {
    setShow(Platform.OS === 'ios');
    if (selectedDate) {
      onChange(selectedDate);
    }
  };

  const formatDate = (date) => {
    if (!date) return 'Select date';
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  // Convert a JS Date to 'YYYY-MM-DD' for the HTML date input, using local
  // date parts (not UTC) to avoid the timezone-shift bug noted elsewhere
  // in this project's Key Learnings.
  const toInputValue = (date) => {
    if (!date) return '';
    const d = new Date(date);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  if (IS_WEB) {
    return (
      <View style={styles.container}>
        {label && <Text style={styles.label}>{label}</Text>}
        {React.createElement('input', {
          type: 'date',
          value: toInputValue(value),
          max: maximumDate ? toInputValue(maximumDate) : undefined,
          min: minimumDate ? toInputValue(minimumDate) : undefined,
          onChange: (e) => {
            if (e.target.value) {
              const [y, m, d] = e.target.value.split('-').map(Number);
              onChange(new Date(y, m - 1, d));
            }
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
        <Text style={value ? styles.dateText : styles.placeholder}>
          {formatDate(value)}
        </Text>
      </TouchableOpacity>
      {show && (
        <DateTimePicker
          value={value || new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'calendar'}
          onChange={handleChange}
          maximumDate={maximumDate}
          minimumDate={minimumDate}
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
  dateText: { fontSize: 14, color: '#333' },
  placeholder: { fontSize: 14, color: '#aaa' },
});

export default DatePickerField;