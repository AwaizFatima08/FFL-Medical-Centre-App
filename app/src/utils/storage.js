import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'ffl_id_token';
const USER_KEY  = 'ffl_user_data';

const isWeb = Platform.OS === 'web';

export const saveToken = async (token) => {
  if (isWeb) { localStorage.setItem(TOKEN_KEY, token); return; }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
};

export const getToken = async () => {
  if (isWeb) return localStorage.getItem(TOKEN_KEY);
  return await SecureStore.getItemAsync(TOKEN_KEY);
};

export const deleteToken = async () => {
  if (isWeb) { localStorage.removeItem(TOKEN_KEY); return; }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
};

export const saveUserData = async (data) => {
  if (isWeb) { localStorage.setItem(USER_KEY, JSON.stringify(data)); return; }
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(data));
};

export const getUserData = async () => {
  if (isWeb) {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }
  const raw = await SecureStore.getItemAsync(USER_KEY);
  return raw ? JSON.parse(raw) : null;
};

export const clearAll = async () => {
  if (isWeb) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
};