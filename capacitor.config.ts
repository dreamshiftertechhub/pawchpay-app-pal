import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.pawchpay.app",
  appName: "PawchPay",
  webDir: "mobile",
  android: {
    allowMixedContent: false,
  },
  // Sends every fetch through the native HTTP stack instead of the WebView,
  // so calls to the hosted server are not blocked by cross-origin rules.
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
