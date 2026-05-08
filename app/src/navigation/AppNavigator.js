// app/src/navigation/AppNavigator.js

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// ─── Home screens ─────────────────────────────────────────────────────────────
import EmployeeHome    from '../screens/home/EmployeeHome';
import ReceptionHome   from '../screens/home/ReceptionHome';
import DriverHome      from '../screens/home/DriverHome';
import DoctorHome      from '../screens/home/DoctorHome';
import NurseHome       from '../screens/home/NurseHome';
import LabTechHome     from '../screens/home/LabTechHome';
import PharmacyHome    from '../screens/home/PharmacyHome';
import AdminHome       from '../screens/home/AdminHome';
import CMOHome         from '../screens/home/CMOHome';

// ─── Ambulance flow ───────────────────────────────────────────────────────────
import AmbulanceRequestScreen          from '../screens/ambulance/AmbulanceRequestScreen';
import AmbulanceRequestReceptionScreen from '../screens/ambulance/AmbulanceRequestReceptionScreen';
import AmbulanceReceptionHubScreen     from '../screens/ambulance/AmbulanceReceptionHubScreen';
import AmbulanceRequestDetailScreen    from '../screens/ambulance/AmbulanceRequestDetailScreen';

// ─── Notification flow ────────────────────────────────────────────────────────
import NotificationScreen from '../screens/notifications/NotificationScreen';

// ─── Fitness flow ─────────────────────────────────────────────────────────────
import FitnessEmployeeScreen from '../screens/fitness/FitnessEmployeeScreen';
import FitnessAdminScreen    from '../screens/fitness/FitnessAdminScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator({ userRole }) {
  const getHomeScreen = () => {
    switch (userRole) {
      case 'reception':       return ReceptionHome;
      case 'driver':          return DriverHome;
      case 'doctor':          return DoctorHome;
      case 'nurse':           return NurseHome;
      case 'lab_technologist':return LabTechHome;
      case 'pharmacy_incharge': return PharmacyHome;
      case 'admin_incharge':  return AdminHome;
      case 'cmo':             return CMOHome;
      default:                return EmployeeHome;
    }
  };

  const HomeScreen = getHomeScreen();

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {/* Home — role-based */}
      <Stack.Screen name="Home" component={HomeScreen} />

      {/* Ambulance flow */}
      <Stack.Screen name="AmbulanceRequest"          component={AmbulanceRequestScreen} />
      <Stack.Screen name="AmbulanceRequestReception" component={AmbulanceRequestReceptionScreen} />
      <Stack.Screen name="AmbulanceReceptionHub"     component={AmbulanceReceptionHubScreen} />
      <Stack.Screen name="AmbulanceRequestDetail"    component={AmbulanceRequestDetailScreen} />

      {/* Notification flow — accessible from any role via bell */}
      <Stack.Screen name="Notifications" component={NotificationScreen} />

      {/* Fitness flow */}
      <Stack.Screen name="FitnessEmployee" component={FitnessEmployeeScreen} />
      <Stack.Screen name="FitnessAdmin"    component={FitnessAdminScreen} />
    </Stack.Navigator>
  );
}