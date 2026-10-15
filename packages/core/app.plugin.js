const { withInfoPlist, withEntitlementsPlist } = require('@expo/config-plugins');

/**
 * Options:
 * - bluetoothPermission / localNetworkPermission: iOS permission prompts
 * - hotspot (default true): let iOS join an Android hotspot for fast Bluetooth-initiated
 *   transfers. Needs the "Hotspot" capability on your App ID.
 * - wifiAware (default true): Wi-Fi Aware between paired devices on iOS 26+. Needs the
 *   "Wi-Fi Aware" capability (paid developer team) on your App ID.
 */
const withCrossshare = (config, props = {}) => {
  const hotspot = props.hotspot !== false;
  const wifiAware = props.wifiAware !== false;

  config = withInfoPlist(config, (config) => {
    const plist = config.modResults;
    plist.NSLocalNetworkUsageDescription =
      props.localNetworkPermission ||
      '$(PRODUCT_NAME) uses the local network to find nearby devices and send files.';
    plist.NSBluetoothAlwaysUsageDescription =
      props.bluetoothPermission ||
      '$(PRODUCT_NAME) uses Bluetooth to find nearby devices, even without Wi-Fi.';
    plist.NSBonjourServices = Array.from(
      new Set([...(plist.NSBonjourServices || []), '_crossshare._tcp'])
    );
    plist.UIBackgroundModes = Array.from(
      new Set([
        ...(plist.UIBackgroundModes || []),
        'bluetooth-central',
        'bluetooth-peripheral',
      ])
    );
    // Show received files in the Files app.
    plist.UIFileSharingEnabled = true;
    plist.LSSupportsOpeningDocumentsInPlace = true;
    plist.CrossshareHotspotJoin = hotspot;
    if (wifiAware) {
      plist.WiFiAwareServices = {
        ...(plist.WiFiAwareServices || {}),
        '_crossshare._tcp': { Publishable: {}, Subscribable: {} },
      };
    }
    return config;
  });

  if (hotspot || wifiAware) {
    config = withEntitlementsPlist(config, (config) => {
      if (hotspot) {
        config.modResults['com.apple.developer.networking.HotspotConfiguration'] = true;
      }
      if (wifiAware) {
        config.modResults['com.apple.developer.wifi-aware'] = ['Publish', 'Subscribe'];
      }
      return config;
    });
  }

  return config;
};

module.exports = withCrossshare;
