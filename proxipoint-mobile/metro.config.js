const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Explicitly enable the file-system router transformer
config.transformer.unstable_allowRequireContext = true;

module.exports = config;