import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey:            "AIzaSyCjTcfR-MB9eJTSSjrhbn0WDajvZRS873w",
  authDomain:        "ffl-medical-centre-app.firebaseapp.com",
  projectId:         "ffl-medical-centre-app",
  storageBucket:     "ffl-medical-centre-app.appspot.com",
  messagingSenderId: "610679483970",
  appId:             "1:610679483970:web:1304ccb543e247384b07db",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export default app;
