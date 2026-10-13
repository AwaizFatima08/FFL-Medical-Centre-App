// app/src/config/api.js
// Central API URL configuration for all Cloud Functions.
// All screen files import from here — never hardcode URLs in screens.

const BASE = 'https://{function}-nnigmcbj4a-el.a.run.app';

export const API = {
  ambulance:     'https://ambulance-nnigmcbj4a-el.a.run.app',
  auth:          'https://auth-nnigmcbj4a-el.a.run.app',
  employees:     'https://employees-nnigmcbj4a-el.a.run.app',
  trips:         'https://trips-nnigmcbj4a-el.a.run.app',
  vaccination:   'https://vaccination-nnigmcbj4a-el.a.run.app',
  notifications: 'https://notifications-nnigmcbj4a-el.a.run.app',
  availability:  'https://availability-nnigmcbj4a-el.a.run.app',
  fitness:       'https://fitness-nnigmcbj4a-el.a.run.app',
  directory:     'https://directory-nnigmcbj4a-el.a.run.app',
  feedback:      'https://feedback-nnigmcbj4a-el.a.run.app',
  reports:       'https://reports-nnigmcbj4a-el.a.run.app',
  circulars:     'https://circulars-nnigmcbj4a-el.a.run.app',
};

// Local testing: route every API call to the functions emulator.
if (process.env.EXPO_PUBLIC_USE_EMULATORS === '1') {
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
  Object.keys(API).forEach((fn) => {
    API[fn] = `http://${host}:5001/demo-sahulat/asia-south1/${fn}`;
  });
}
