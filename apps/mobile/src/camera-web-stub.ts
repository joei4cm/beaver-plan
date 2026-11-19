import { View } from "react-native";

/** Web stub — Expo SDK camera packages are mismatched for web in this monorepo. */
export const CameraView = View;

export function useCameraPermissions(): [
  { granted: boolean; canAskAgain: boolean } | null,
  () => Promise<{ granted: boolean }>,
] {
  return [
    { granted: false, canAskAgain: false },
    async () => ({ granted: false }),
  ];
}
