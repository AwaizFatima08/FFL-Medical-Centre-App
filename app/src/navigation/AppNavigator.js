import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';

// Role-based home screens (we'll build these next)
import EmployeeHome from '../screens/home/EmployeeHome';
import ReceptionHome from '../screens/home/ReceptionHome';
import DriverHome from '../screens/home/DriverHome';
import DoctorHome from '../screens/home/DoctorHome';
import NurseHome from '../screens/home/NurseHome';
import LabTechHome from '../screens/home/LabTechHome';
import PharmacyHome from '../screens/home/PharmacyHome';
import AdminHome from '../screens/home/AdminHome';
import CMOHome from '../screens/home/CMOHome';

const Stack = createStackNavigator();

export default function AppNavigator({ userRole }) {
  const getHomeScreen = () => {
    switch (userRole) {
      case 'reception':       return ReceptionHome;
      case 'driver':          return DriverHome;
      case 'doctor':          return DoctorHome;
      case 'nurse':           return NurseHome;
      case 'lab_technologist':return LabTechHome;
      case 'pharmacy_incharge':return PharmacyHome;
      case 'admin_incharge':  return AdminHome;
      case 'cmo':             return CMOHome;
      default:                return EmployeeHome; // fallback
    }
  };

  const HomeScreen = getHomeScreen();

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
    </Stack.Navigator>
  );
}