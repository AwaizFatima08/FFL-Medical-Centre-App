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
import MyAmbulanceRequestScreen        from '../screens/ambulance/MyAmbulanceRequestScreen';
import AmbulanceHistoryScreen          from '../screens/ambulance/AmbulanceHistoryScreen';
import AmbulanceCMOHistoryScreen       from '../screens/ambulance/AmbulanceCMOHistoryScreen';

// ─── Notification flow ────────────────────────────────────────────────────────
import NotificationScreen from '../screens/notifications/NotificationScreen';

// ─── Fitness flow ─────────────────────────────────────────────────────────────
import FitnessEmployeeScreen from '../screens/fitness/FitnessEmployeeScreen';
import FitnessAdminScreen    from '../screens/fitness/FitnessAdminScreen';

// ─── Trip flow ────────────────────────────────────────────────────────────────
import TripBookingScreen      from '../screens/trip/TripBookingScreen';
import TripMyBookingScreen    from '../screens/trip/TripMyBookingScreen';
import TripDetailScreen       from '../screens/trip/TripDetailScreen';
import TripReceptionHubScreen from '../screens/trip/TripReceptionHubScreen';
import TripReportScreen       from '../screens/trip/TripReportScreen';
import TripViewScreen         from '../screens/trip/TripViewScreen';

// ─── Directory flow ───────────────────────────────────────────────────────────
import DirectoryListScreen    from '../screens/directory/DirectoryListScreen';
import DirectoryDetailScreen  from '../screens/directory/DirectoryDetailScreen';
import DirectoryAddEditScreen from '../screens/directory/DirectoryAddEditScreen';

// ─── Feedback flow ────────────────────────────────────────────────────────────
import FeedbackFormScreen   from '../screens/feedback/FeedbackFormScreen';
import FeedbackListScreen   from '../screens/feedback/FeedbackListScreen';
import FeedbackDetailScreen from '../screens/feedback/FeedbackDetailScreen';

// ─── Doctor Availability flow ─────────────────────────────────────────────────
import DoctorAvailabilityScreen       from '../screens/availability/DoctorAvailabilityScreen';
import DoctorAvailabilityManageScreen from '../screens/availability/DoctorAvailabilityManageScreen';

// ─── Circulars flow ───────────────────────────────────────────────────────────
import CircularsScreen      from '../screens/circulars/CircularsScreen';
import CircularUploadScreen from '../screens/circulars/CircularUploadScreen';

// ─── Admin flow ───────────────────────────────────────────────────────────────
import UserApprovalScreen from '../screens/admin/UserApprovalScreen';
import UserManagementScreen from '../screens/admin/UserManagementScreen';
import HealthTipsAdminScreen from '../screens/admin/HealthTipsAdminScreen';

// ─── Family flow ──────────────────────────────────────────────────────────────
import FamilyMemberListScreen  from '../screens/family/FamilyMemberListScreen';
import FamilyMemberAddScreen   from '../screens/family/FamilyMemberAddScreen';
import FamilyMemberEditScreen  from '../screens/family/FamilyMemberEditScreen';
import FamilyAdminReviewScreen from '../screens/family/FamilyAdminReviewScreen';

// ─── Vaccination flow ─────────────────────────────────────────────────────────
import VaccinationChildListScreen   from '../screens/vaccination/VaccinationChildListScreen';
import VaccinationChildDetailScreen from '../screens/vaccination/VaccinationChildDetailScreen';
import VaccinationAdministerScreen  from '../screens/vaccination/VaccinationAdministerScreen';
import VaccinationReportScreen      from '../screens/vaccination/VaccinationReportScreen';

// ─── Blood Donor Directory ────────────────────────────────────────────────────
import BloodDonorDirectoryScreen from '../screens/donors/BloodDonorDirectoryScreen';

// ─── Reports ──────────────────────────────────────────────────────────────────
import ReportsHubScreen          from '../screens/reports/ReportsHubScreen';
import TripDayReportScreen       from '../screens/reports/TripDayReportScreen';
import TripMonthlyReportScreen   from '../screens/reports/TripMonthlyReportScreen';
import AmbulanceKPIReportScreen  from '../screens/reports/AmbulanceKPIReportScreen';
import PopulationReportScreen    from '../screens/reports/PopulationReportScreen';
import EmployeeOnlyReportScreen  from '../screens/reports/EmployeeOnlyReportScreen';
import BloodGroupReportScreen    from '../screens/reports/BloodGroupReportScreen';

// ─── My Profile (Phase 4, Day 14) ──────────────────────────────────────────────
import MyProfileScreen from '../screens/profile/MyProfileScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator({ userRole }) {
  const getHomeScreen = () => {
    switch (userRole) {
      case 'reception':         return ReceptionHome;
      case 'driver':            return DriverHome;
      case 'doctor':            return DoctorHome;
      case 'nurse':             return NurseHome;
      case 'lab_technologist':  return LabTechHome;
      case 'pharmacy_incharge': return PharmacyHome;
      case 'admin_incharge':    return AdminHome;
      case 'cmo':               return CMOHome;
      default:                  return EmployeeHome;
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
      <Stack.Screen name="MyAmbulanceRequest"        component={MyAmbulanceRequestScreen} />
      {/* Day 19 (Phase 5.9) — reception-only completed/cancelled history */}
      <Stack.Screen name="AmbulanceHistory"          component={AmbulanceHistoryScreen} />
      {/* Day 20 (Phase 5.8.2) — CMO/Doctor full-status history + KPIs */}
      <Stack.Screen name="AmbulanceCMOHistory"       component={AmbulanceCMOHistoryScreen} />

      {/* Notification flow */}
      <Stack.Screen name="Notifications" component={NotificationScreen} />

      {/* Fitness flow */}
      <Stack.Screen name="FitnessEmployee" component={FitnessEmployeeScreen} />
      <Stack.Screen name="FitnessAdmin"    component={FitnessAdminScreen} />

      {/* Trip flow */}
      <Stack.Screen name="TripBooking"      component={TripBookingScreen} />
      <Stack.Screen name="TripMyBooking"    component={TripMyBookingScreen} />
      <Stack.Screen name="TripDetail"       component={TripDetailScreen} />
      <Stack.Screen name="TripReceptionHub" component={TripReceptionHubScreen} />
      <Stack.Screen name="TripReport"       component={TripReportScreen} />
      <Stack.Screen name="TripView"         component={TripViewScreen} />

      {/* Directory flow */}
      <Stack.Screen name="DirectoryList"    component={DirectoryListScreen} />
      <Stack.Screen name="DirectoryDetail"  component={DirectoryDetailScreen} />
      <Stack.Screen name="DirectoryAddEdit" component={DirectoryAddEditScreen} />

      {/* Feedback flow */}
      <Stack.Screen name="Feedback"       component={FeedbackFormScreen} />
      <Stack.Screen name="FeedbackList"   component={FeedbackListScreen} />
      <Stack.Screen name="FeedbackDetail" component={FeedbackDetailScreen} />

      {/* Doctor Availability flow */}
      <Stack.Screen name="DoctorAvailability"       component={DoctorAvailabilityScreen} />
      <Stack.Screen name="DoctorAvailabilityManage" component={DoctorAvailabilityManageScreen} />

      {/* Circulars flow */}
      <Stack.Screen name="Circulars"      component={CircularsScreen} />
      <Stack.Screen name="CircularUpload" component={CircularUploadScreen} />

      {/* Family flow */}
      <Stack.Screen name="FamilyMemberList"  component={FamilyMemberListScreen} />
      <Stack.Screen name="FamilyMemberAdd"   component={FamilyMemberAddScreen} />
      <Stack.Screen name="FamilyMemberEdit"  component={FamilyMemberEditScreen} />
      <Stack.Screen name="FamilyAdminReview" component={FamilyAdminReviewScreen} />

      {/* Admin flow */}
      <Stack.Screen name="UserApproval" component={UserApprovalScreen} />
      <Stack.Screen name="UserManagement" component={UserManagementScreen} />
      <Stack.Screen name="HealthTipsAdmin" component={HealthTipsAdminScreen} />

      {/* Vaccination flow */}
      <Stack.Screen name="VaccinationChildList"   component={VaccinationChildListScreen} />
      <Stack.Screen name="VaccinationChildDetail" component={VaccinationChildDetailScreen} />
      <Stack.Screen name="VaccinationAdminister"  component={VaccinationAdministerScreen} />
      <Stack.Screen name="VaccinationReport"      component={VaccinationReportScreen} />

      {/* Blood Donor Directory */}
      <Stack.Screen name="BloodDonorDirectory" component={BloodDonorDirectoryScreen} />

      {/* Reports */}
      <Stack.Screen name="ReportsHub"        component={ReportsHubScreen} />
      <Stack.Screen name="TripDayReport"     component={TripDayReportScreen} />
      <Stack.Screen name="TripMonthlyReport" component={TripMonthlyReportScreen} />
      <Stack.Screen name="AmbulanceKPIReport" component={AmbulanceKPIReportScreen} />
      <Stack.Screen name="TownshipReport"    component={PopulationReportScreen} />
      <Stack.Screen name="NonTownshipReport" component={PopulationReportScreen} />
      <Stack.Screen name="EmployeeOnlyReport" component={EmployeeOnlyReportScreen} />
      <Stack.Screen name="BloodGroupReport"  component={BloodGroupReportScreen} />

      {/* My Profile (Phase 4, Day 14) */}
      <Stack.Screen name="MyProfile" component={MyProfileScreen} />

    </Stack.Navigator>
  );
}