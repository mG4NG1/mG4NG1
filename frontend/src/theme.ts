// Design tokens for this app (light theme). Keys match the "color" block of
// /app/design_guidelines.json. Use makeStyles / useTheme in components.

import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#F2F2F7",
  onSurface: "#1C1C1E",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#1C1C1E",
  surfaceTertiary: "#E5E5EA",
  onSurfaceTertiary: "#3A3A3C",
  surfaceInverse: "#1C1C1E",
  onSurfaceInverse: "#FFFFFF",
  muted: "#8E8E93",

  brand: "#E68A00",
  onBrand: "#FFFFFF",
  brandPrimary: "#E68A00",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#2C2C2E",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#FDE6C7",
  onBrandTertiary: "#8A5200",

  success: "#34C759",
  onSuccess: "#FFFFFF",
  warning: "#FFCC00",
  onWarning: "#1C1C1E",
  error: "#FF3B30",
  onError: "#FFFFFF",
  info: "#E68A00",
  onInfo: "#FFFFFF",

  border: "#C6C6C8",
  borderStrong: "#8E8E93",
  divider: "#E5E5EA",
  scrim: "rgba(28,28,30,0.85)",
  brandAreaFill: "rgba(230,138,0,0.18)",
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };
export const font = { sm: 12, base: 14, lg: 16, xl: 20, xxl: 24, display: 32 };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = (system === "light" || system === "dark") && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
