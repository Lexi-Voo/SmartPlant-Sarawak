/**
 * ============================================================================
 * SMARTPLANT SARAWAK - MOBILE APP (React Native + Expo)
 * ============================================================================
 * 
 * PURPOSE:
 * Main entry point for SmartPlant Sarawak mobile application.
 * Plant identification app with AI, community validation, and conservation tracking.
 * 
 * TECHNOLOGY STACK:
 * - React Native: Cross-platform mobile framework
 * - Expo: Development tooling and native APIs
 * - TypeScript: Type-safe JavaScript
 * - React Navigation: Screen navigation
 * 
 * MAIN FEATURES:
 * 1. AI Plant Identification (Camera + Image Library)
 * 2. Interactive Map (Plant Locations + Heatmap)
 * 3. Species Catalog (15 Sarawak Native Plants)
 * 4. Community Validation (Crowdsourced Accuracy)
 * 5. User Profiles (History + Statistics)
 * 6. Admin Dashboard (Monitoring + Management)
 * 
 * APP STRUCTURE:
 * - SafeAreaProvider: Handles device notches and safe areas
 * - StatusBar: Manages status bar appearance
 * - AppNavigator: Main navigation configuration (see AppNavigator.tsx)
 * 
 * NAVIGATION FLOW:
 * Loading → Splash → Landing → Auth → Main App Tabs
 * 
 * PLATFORM SUPPORT:
 * - iOS: iPhone/iPad
 * - Android: Phone/Tablet
 * - Web: Browser (limited support)
 * 
 * USAGE:
 * npm start (opens Expo Dev Tools)
 * npm run android (run on Android)
 * npm run ios (run on iOS)
 * ============================================================================
 */

// ============================================================================
// IMPORTS
// ============================================================================

import React from 'react';  // React library
import { SafeAreaProvider } from 'react-native-safe-area-context';  // Handle device safe areas (notches)
import { StatusBar } from 'expo-status-bar';  // Status bar component
import AppNavigator from './src/navigation/AppNavigator';  // Main navigation configuration
import { AuthProvider } from './src/components/AuthContext'; //Import session managemend handler

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

/**
 * Root App component
 * Wraps navigation with essential providers
 */
export default function App() {
  return (
    <SafeAreaProvider>
      {/* Status bar with automatic style (light/dark based on background) */}
      <StatusBar style="auto" />
      
      {/* Main navigation tree - handles all screen routing */}
      <AuthProvider>
        <AppNavigator />  
      </AuthProvider>
    </SafeAreaProvider>
  );
}
