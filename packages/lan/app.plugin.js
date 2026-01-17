const { withInfoPlist } = require("@expo/config-plugins");

const withCrossshareLan = (config, props = {}) => {
  const localNetworkPermission =
    props.localNetworkPermission ||
    "$(PRODUCT_NAME) needs local network access to discover nearby devices for file sharing.";

  return withInfoPlist(config, (config) => {
    // Add local network usage description
    config.modResults.NSLocalNetworkUsageDescription = localNetworkPermission;

    // Add Bonjour service types
    config.modResults.NSBonjourServices = [
      ...(config.modResults.NSBonjourServices || []),
      "_crossshare._tcp",
    ];

    return config;
  });
};

module.exports = withCrossshareLan;
