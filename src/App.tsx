import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'react-native';
import './global.css';

import LandingScreen from './screens/index';
import TabNavigator from './navigation/TabNavigator';
import EnrollmentNavigator from './navigation/EnrollmentNavigator';

const Stack = createNativeStackNavigator();

export default function App() {
    return (
        <NavigationContainer>
            <StatusBar barStyle="dark-content" />
            <Stack.Navigator screenOptions={{ headerShown: false }}>
                <Stack.Screen name="Landing" component={LandingScreen} />
                <Stack.Screen name="Tabs" component={TabNavigator} />
                <Stack.Screen name="Enrollment" component={EnrollmentNavigator} />
            </Stack.Navigator>
        </NavigationContainer>
    );
}
