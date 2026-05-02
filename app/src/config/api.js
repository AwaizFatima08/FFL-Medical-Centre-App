const REGION  = 'asia-south1';
const PROJECT = 'ffl-medical-centre-app';
const BASE    = `https://${REGION}-${PROJECT}.cloudfunctions.net`;

export const API = {
  AUTH:          'https://auth-nnigmcbj4a-el.a.run.app',
  EMPLOYEES:     `${BASE}/employees`,
  AMBULANCE:     `${BASE}/ambulance`,
  TRIPS:         `${BASE}/trips`,
  VACCINATION:   `${BASE}/vaccination`,
  NOTIFICATIONS: `${BASE}/notifications`,
  AVAILABILITY:  `${BASE}/availability`,
  FITNESS:       `${BASE}/fitness`,
  DIRECTORY:     `${BASE}/directory`,
  FEEDBACK:      `${BASE}/feedback`,
  REPORTS:       `${BASE}/reports`,
};
