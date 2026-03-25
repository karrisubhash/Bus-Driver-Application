import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  SafeAreaView,
  PermissionsAndroid,
  Platform,
} from "react-native";
import axios from "axios";
import Geolocation from "react-native-geolocation-service";
import BackgroundService from "react-native-background-actions";

const BASE_URL = "https://college-bus-tracking-system-ri73.onrender.com";

export default function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [tripId, setTripId] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [isTracking, setIsTracking] = useState(false);

  // ================= PERMISSION =================
  const requestLocationPermission = async () => {
    if (Platform.OS === "android") {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );

      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert("Location permission denied");
        return false;
      }
    }
    return true;
  };

  // ================= LOGIN =================
  const login = async () => {
    try {
      const response = await axios.post(`${BASE_URL}/api/token/`, {
        username,
        password,
      });

      setToken(response.data.access);
      Alert.alert("Login Successful");
    } catch (error: any) {
      Alert.alert(
        "Login Failed",
        error.response?.data?.detail || "Invalid credentials"
      );
    }
  };

  // ================= BACKGROUND TASK =================
  const trackingTask = async () => {
    await new Promise(async () => {
      while (BackgroundService.isRunning()) {

        Geolocation.getCurrentPosition(
          async (position) => {

            const lat = position.coords.latitude;
            const lon = position.coords.longitude;

            console.log("GPS:", lat, lon);

            try {

              await axios.post(
                `${BASE_URL}/api/trips/${Number(tripId)}/pings/`,
                {
                  lat: lat,
                  lon: lon
                },
                {
                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                  timeout: 10000
                }
              );

              console.log("Location sent");

            } catch (error) {

              console.log("Network error. Will retry next cycle.");

              // DO NOT STOP TRACKING
              // Just ignore and retry next loop

            }

          },
          (error) => {
            console.log("GPS Error:", error.message);
          },
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0,
            distanceFilter: 5
          }
        );

        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    });
  };
  // ================= START TRACKING =================
  const startTracking = async () => {
    if (!token) {
      Alert.alert("Login First");
      return;
    }

    if (!tripId) {
      Alert.alert("Enter Trip ID");
      return;
    }

    const permissionGranted = await requestLocationPermission();
    if (!permissionGranted) return;

    try {
      // 🔥 CLAIM TRIP FIRST
      await axios.post(
        `${BASE_URL}/api/trips/${Number(tripId)}/claim/`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      console.log("Trip claimed");

    } catch (error: any) {
      Alert.alert(
        "Cannot Claim Trip",
        error.response?.data?.detail || "Trip already assigned"
      );
      return;
    }

    try {
      await BackgroundService.start(trackingTask, {
        taskName: "Bus Tracking",
        taskTitle: "Bus Tracking Active",
        taskDesc: "Sending live location",
        taskIcon: {
          name: "ic_launcher",
          type: "mipmap",
        },
        color: "#ff0000",
      });

      setIsTracking(true);
      Alert.alert("Tracking Started");
    } catch {
      Alert.alert("Failed to start tracking");
    }
  };

  // ================= STOP TRACKING =================
  const stopTracking = async () => {
    try {
      await axios.post(
        `${BASE_URL}/api/trips/${Number(tripId)}/end/`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
    } catch { }

    await BackgroundService.stop();
    setIsTracking(false);
    Alert.alert("Tracking Stopped");
  };

  // ================= REPORT ISSUE =================
  const reportIssue = async () => {
    try {
      await axios.post(
        `${BASE_URL}/api/trips/${Number(tripId)}/report-issue/`,
        { issue: "Bus Breakdown" },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      Alert.alert("Issue Reported");
    } catch (error: any) {
      Alert.alert(
        "Error",
        error.response?.data?.detail || "Failed to report issue"
      );
    }
  };

  // ================= RESOLVE ISSUE =================
  const resolveIssue = async () => {
    try {
      await axios.post(
        `${BASE_URL}/api/trips/${Number(tripId)}/resolve-issue/`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      Alert.alert("Issue Resolved");
    } catch (error: any) {
      Alert.alert(
        "Error",
        error.response?.data?.detail || "Failed to resolve issue"
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Bus Driver App</Text>

      <TextInput
        style={styles.input}
        placeholder="Username"
        value={username}
        onChangeText={setUsername}
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity style={styles.blueButton} onPress={login}>
        <Text style={styles.buttonText}>LOGIN</Text>
      </TouchableOpacity>

      <TextInput
        style={styles.input}
        placeholder="Trip ID"
        keyboardType="numeric"
        value={tripId}
        onChangeText={setTripId}
      />

      <TouchableOpacity style={styles.greenButton} onPress={startTracking}>
        <Text style={styles.buttonText}>START TRACKING</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.redButton} onPress={stopTracking}>
        <Text style={styles.buttonText}>STOP & END TRIP</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.orangeButton} onPress={reportIssue}>
        <Text style={styles.buttonText}>REPORT ISSUE 🚨</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.blueButton} onPress={resolveIssue}>
        <Text style={styles.buttonText}>ISSUE RESOLVED ✅</Text>
      </TouchableOpacity>

      {isTracking && (
        <Text style={styles.trackingIndicator}>
          ● Tracking Active
        </Text>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 20 },
  input: {
    borderWidth: 1,
    padding: 12,
    marginVertical: 8,
    borderRadius: 6,
  },
  blueButton: {
    backgroundColor: "#2E86C1",
    padding: 15,
    marginVertical: 8,
    borderRadius: 6,
    alignItems: "center",
  },
  greenButton: {
    backgroundColor: "#28B463",
    padding: 15,
    marginVertical: 8,
    borderRadius: 6,
    alignItems: "center",
  },
  redButton: {
    backgroundColor: "#E74C3C",
    padding: 15,
    marginVertical: 8,
    borderRadius: 6,
    alignItems: "center",
  },
  orangeButton: {
    backgroundColor: "#F39C12",
    padding: 15,
    marginVertical: 8,
    borderRadius: 6,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "bold" },
  trackingIndicator: {
    marginTop: 15,
    color: "green",
    fontWeight: "bold",
    textAlign: "center",
  },
});