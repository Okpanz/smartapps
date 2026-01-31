import React, { useMemo } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { useNetInfo } from "@react-native-community/netinfo";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export const NetworkIndicator = () => {
  const { isConnected, isInternetReachable, type } = useNetInfo();
  const insets = useSafeAreaInsets();

 
  const status = useMemo(() => {
    const reachableUnknown = isInternetReachable == null;

    if (isConnected === false) return "offline";
    if (isConnected === true && isInternetReachable === false) return "offline"; 
    if (isConnected === true && reachableUnknown) return "unknown";
    return "online";
  }, [isConnected, isInternetReachable]);

  if (status === "online" || status === "unknown") return null;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.wrapper,
        { top: insets.top + (Platform.OS === "android" ? 6 : 0) },
      ]}
    >
      <View style={styles.pill}>
        <Text style={styles.text}>No Internet</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 9999,
    alignItems: "center",
  },
  pill: {
    backgroundColor: "#ef4444",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    // tiny shadow to float above UI
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  text: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
});
