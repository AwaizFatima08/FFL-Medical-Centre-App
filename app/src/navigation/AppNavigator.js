// app/src/navigation/AppNavigator.js
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// ── Home screens ──────────────────────────────────────────────
import EmployeeHome from '../screens/home/EmployeeHome';
import ReceptionHome from '../screens/home/ReceptionHome';
import DriverHome from '../screens/home/DriverHome';
import DoctorHome from '../screens/home/DoctorHome';
import NurseHome from '../screens/home/NurseHome';
import LabTechHome from '../screens/home/LabTechHome';
import PharmacyHome from '../screens/home/PharmacyHome';
import AdminHome from '../screens/home/AdminHome';
import CMOHome from '../screens/home/CMOHome';

// ── Flow 1 — Ambulance ───────────────────────────────────────
import AmbulanceRequestScreen from '../screens/ambulance/AmbulanceRequestScreen';
import AmbulanceRequestReceptionScreen from '../screens/ambulance/AmbulanceRequestReceptionScreen';
import AmbulanceReceptionHubScreen from '../screens/ambulance/AmbulanceReceptionHubScreen';
import AmbulanceRequestDetailScreen from '../screens/ambulance/AmbulanceRequestDetailScreen';

// ── Flow 4 — Medical Trip ────────────────────────────────────
import TripBookingScreen from '../screens/trip/TripBookingScreen';
import TripMyBookingScreen from '../screens/trip/TripMyBookingScreen';
import TripReceptionHubScreen from '../screens/trip/TripReceptionHubScreen';
import TripDetailScreen from '../screens/trip/TripDetailScreen';
import TripViewScreen from '../screens/trip/TripViewScreen';
import TripReportScreen from '../screens/trip/TripReportScreen';

// ── Flow 5 — Doctor Directory ────────────────────────────────
import DirectoryListScreen from '../screens/directory/DirectoryListScreen';
import DirectoryDetailScreen from '../screens/directory/DirectoryDetailScreen';
import DirectoryAddEditScreen from '../screens/directory/DirectoryAddEditScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator({ userRole }) {
  const getHomeScreen = () => {
    switch (userRole) {
      case 'reception':        return ReceptionHome;
      case 'driver':           return DriverHome;
      case 'doctor':           return DoctorHome;
      case 'nurse':            return NurseHome;
      case 'lab_technologist': return LabTechHome;
      case 'pharmacy_incharge':return PharmacyHome;
      case 'admin_incharge':   return AdminHome;
      case 'cmo':              return CMOHome;
      default:                 return EmployeeHome;
    }
  };

  const HomeScreen = getHomeScreen();

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>

      {/* Home — role-based */}
      <Stack.Screen name="Home" component={HomeScreen} />

      {/* ── Flow 1 — Ambulance ─────────────────────────────── */}
      <Stack.Screen name="AmbulanceRequest"          component={AmbulanceRequestScreen} />
      <Stack.Screen name="AmbulanceRequestReception" component={AmbulanceRequestReceptionScreen} />
      <Stack.Screen name="AmbulanceReceptionHub"     component={AmbulanceReceptionHubScreen} />
      <Stack.Screen name="AmbulanceRequestDetail"    component={AmbulanceRequestDetailScreen} />

      {/* ── Flow 4 — Medical Trip ──────────────────────────── */}
      <Stack.Screen name="TripBooking"        component={TripBookingScreen} />
      <Stack.Screen name="TripMyBooking"      component={TripMyBookingScreen} />
      <Stack.Screen name="TripReceptionHub"   component={TripReceptionHubScreen} />
      <Stack.Screen name="TripDetail"         component={TripDetailScreen} />
      <Stack.Screen name="TripView"           component={TripViewScreen} />
      <Stack.Screen name="TripReport"         component={TripReportScreen} />

      {/* ── Flow 5 — Doctor Directory ──────────────────────── */}
      <Stack.Screen name="DirectoryList"      component={DirectoryListScreen} />
      <Stack.Screen name="DirectoryDetail"    component={DirectoryDetailScreen} />
      <Stack.Screen name="DirectoryAddEdit"   component={DirectoryAddEditScreen} />

    </Stack.Navigator>
  );
}