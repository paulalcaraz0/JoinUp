require('dotenv').config();

const appJson = require('./app.json');

module.exports = ({ config } = {}) => {
  const baseConfig = config ?? appJson.expo;

  return {
    ...baseConfig,
    extra: {
      ...(baseConfig.extra ?? {}),
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? baseConfig.extra?.supabaseUrl,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_KEY ?? baseConfig.extra?.supabaseAnonKey,
    },
  };
};
