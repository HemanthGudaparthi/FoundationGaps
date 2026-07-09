import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId:    "com.hemanthgudaparthi.foundationgaps",
  appName:  "FoundationGaps",
  webDir:   "dist",
  server: {
    // Use this during dev with `npm run dev` + `npx cap run ios --livereload`
    // Comment out for production builds
    // url: "http://YOUR_LOCAL_IP:5173",
    // cleartext: true,
  },
  ios: {
    contentInset: "automatic",
    backgroundColor: "#0f0f13",
    preferredContentMode: "mobile",
    limitsNavigationsToAppBoundDomains: true,
  },
  plugins: {
    CapacitorSQLite: {
      iosDatabaseLocation: "Library/CapacitorDatabase",
    },
    Filesystem: {
      // No extra config needed — will request permissions at runtime
    },
    Preferences: {
      group: "com.hemanthgudaparthi.funda",
    },
  },
};

export default config;
