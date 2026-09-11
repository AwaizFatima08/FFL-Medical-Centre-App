// src/utils/downloadFile.js
// Secure file download utility — uses Authorization header, not token in URL.
// Web: blob download via an anchor tag.
// Native (Android/iOS): downloads to a local file (with the auth header
// attached directly, same as the web path) then hands it to the OS share
// sheet via expo-sharing, so the user can save/open/send the PDF. This
// used to be an unconditional "not supported on mobile yet" alert, which
// meant every report screen's PDF export (11 screens) was non-functional
// on the phones this app is primarily used on.

import { Platform } from 'react-native';
import { getAuth } from 'firebase/auth';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export const downloadFile = async (url, filename) => {
  const auth  = getAuth();
  const token = await auth.currentUser.getIdToken();

  if (Platform.OS !== 'web') {
    const fileUri = `${FileSystem.cacheDirectory}${filename}`;
    const { status, uri } = await FileSystem.downloadAsync(url, fileUri, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (status !== 200) {
      throw new Error(`Download failed: ${status}`);
    }

    const isCsv = filename.toLowerCase().endsWith('.csv');
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: isCsv ? 'text/csv' : 'application/pdf',
        dialogTitle: filename,
        UTI: isCsv ? 'public.comma-separated-values-text' : 'com.adobe.pdf',
      });
    } else {
      alert(`Report saved to: ${uri}`);
    }
    return;
  }

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