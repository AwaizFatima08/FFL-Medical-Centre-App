// src/utils/downloadFile.js
// Secure file download utility — uses Authorization header, not token in URL
// Works on web (blob download). Android/iOS: informational alert for V1.
// V2: implement react-native-blob-util for mobile download.

import { Platform } from 'react-native';
import { getAuth } from 'firebase/auth';

export const downloadFile = async (url, filename) => {
  if (Platform.OS !== 'web') {
    alert(`Download not supported on mobile yet. Please use the web version to download ${filename}.`);
    return;
  }

  const auth  = getAuth();
  const token = await auth.currentUser.getIdToken();

  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`);
  }

  const blob    = await response.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const anchor  = document.createElement('a');
  anchor.href     = blobUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(blobUrl);
};