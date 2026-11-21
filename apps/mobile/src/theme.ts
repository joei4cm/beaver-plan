import { Platform, type TextStyle } from "react-native";

/** Plus Jakarta on web; system UI + PingFang/Noto CJK elsewhere. */
export const fontBody =
  Platform.OS === "web"
    ? '"Plus Jakarta Sans", "PingFang SC", "Noto Sans SC", "Hiragino Sans GB", system-ui, sans-serif'
    : undefined;

/** Bricolage display on web; system heavy weight + CJK elsewhere. */
export const fontDisplay =
  Platform.OS === "web"
    ? '"Bricolage Grotesque", "PingFang SC", "Noto Sans SC", system-ui, sans-serif'
    : undefined;

export const type = {
  display: { fontFamily: fontDisplay } satisfies TextStyle,
  body: { fontFamily: fontBody } satisfies TextStyle,
} as const;

/** Inject Lumen Route webfonts once (Expo web screenshot / browser). */
export function ensureLumenWebFonts(): void {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  const id = "beaver-lumen-fonts";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap";
  document.head.appendChild(link);
}
