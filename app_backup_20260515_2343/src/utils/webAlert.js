// app/src/utils/webAlert.js
// Alert.alert is silent on Expo web — these helpers work on both web and native.
//
// Usage:
//   import { webAlert, webConfirm } from '../../utils/webAlert';

import { Alert, Platform } from 'react-native';

export const webAlert = (title, message) => {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
  } else {
    Alert.alert(title, message);
  }
};

export const webConfirm = (
  title,
  message,
  onConfirm,
  destructive = false,
  confirmText = 'Confirm',
  cancelText  = 'Cancel',
) => {
  if (Platform.OS === 'web') {
    if (window.confirm(message ? `${title}\n\n${message}` : title)) {
      onConfirm();
    }
  } else {
    Alert.alert(title, message, [
      { text: cancelText, style: 'cancel' },
      {
        text: confirmText,
        style: destructive ? 'destructive' : 'default',
        onPress: onConfirm,
      },
    ]);
  }
};
