import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.pawchpay.app",
  appName: "PawchPay",
  webDir: "mobile",
  android: {
    allowMixedContent: false,
  },
};

export default config;
