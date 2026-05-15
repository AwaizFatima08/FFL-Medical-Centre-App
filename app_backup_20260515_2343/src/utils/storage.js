import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'ffl_id_token';
const USER_KEY  = 'ffl_user_data';

export const saveToken = async (token) => {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
};

export const getToken = async () => {
  return await SecureStore.getItemAsync(TOKEN_KEY);
};

export const deleteToken = async () => {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
};

export const saveUserData = async (data) => {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(data));
};

export const getUserData = async () => {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  return raw ? JSON.parse(raw) : null;
};

export const clearAll = async () => {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
};
