const fs = require('fs');
const path = require('path');
const {
  withAndroidManifest,
  withDangerousMod,
  withEntitlementsPlist,
  withInfoPlist,
  withXcodeProject,
} = require('@expo/config-plugins');

/**
 * Options:
 * - bluetoothPermission / localNetworkPermission: iOS permission prompts
 * - hotspot (default true): let iOS join an Android hotspot for fast Bluetooth-initiated
 *   transfers. Needs the "Hotspot" capability on your App ID.
 * - wifiAware (default true): Wi-Fi Aware between paired devices on iOS 26+. Needs the
 *   "Wi-Fi Aware" capability (paid developer team) on your App ID.
 * - share (default true): show Crossshare in the system share sheet ("Share" / "Open with").
 *   On iOS this adds a share extension, which needs the "App Groups" capability on both App IDs
 *   (<bundle id> and <bundle id>.share) with the group group.<bundle id>.
 */
const withCrossshare = (config, props = {}) => {
  const hotspot = props.hotspot !== false;
  const wifiAware = props.wifiAware !== false;
  const share = props.share !== false;

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
    if (share) plist.CrossshareAppGroup = appGroup(config);
    return config;
  });

  if (hotspot || wifiAware || share) {
    config = withEntitlementsPlist(config, (config) => {
      if (hotspot) {
        config.modResults['com.apple.developer.networking.HotspotConfiguration'] = true;
      }
      if (wifiAware) {
        config.modResults['com.apple.developer.wifi-aware'] = ['Publish', 'Subscribe'];
      }
      if (share) {
        const groups = config.modResults['com.apple.security.application-groups'] || [];
        config.modResults['com.apple.security.application-groups'] = Array.from(
          new Set([...groups, appGroup(config)])
        );
      }
      return config;
    });
  }

  if (share) {
    config = withAndroidShareTarget(config);
    config = withShareExtensionFiles(config);
    config = withShareExtensionTarget(config);
  }

  return config;
};

// Android: the main activity accepts shares and "open with". CrossshareCoreModule reads the intent.

const withAndroidShareTarget = (config) =>
  withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application?.[0];
    const activity = app?.activity?.find((a) => a.$['android:name'] === '.MainActivity');
    if (!activity) return config;
    const filter = (action) => ({
      action: [{ $: { 'android:name': action } }],
      category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
      data: [{ $: { 'android:mimeType': '*/*' } }],
    });
    const actions = [
      'android.intent.action.SEND',
      'android.intent.action.SEND_MULTIPLE',
      'android.intent.action.VIEW',
    ];
    activity['intent-filter'] = (activity['intent-filter'] || []).filter(
      (f) =>
        !(
          f.data?.[0]?.$?.['android:mimeType'] === '*/*' &&
          actions.includes(f.action?.[0]?.$?.['android:name'])
        )
    );
    activity['intent-filter'].push(...actions.map(filter));
    return config;
  });

// iOS: a share extension target that hands files to the app through the app group.

const SHARE_TARGET = 'CrossshareShare';

const appGroup = (config) => `group.${config.ios?.bundleIdentifier}`;

const hostScheme = (config) =>
  [].concat(config.scheme || [])[0] || config.ios?.bundleIdentifier;

const withShareExtensionFiles = (config) =>
  withDangerousMod(config, [
    'ios',
    (config) => {
      const dir = path.join(config.modRequest.platformProjectRoot, SHARE_TARGET);
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(
        path.join(__dirname, 'ios', 'ShareExtension', 'ShareViewController.swift'),
        path.join(dir, 'ShareViewController.swift')
      );
      fs.writeFileSync(
        path.join(dir, 'Info.plist'),
        plist({
          CFBundleDevelopmentRegion: '$(DEVELOPMENT_LANGUAGE)',
          CFBundleDisplayName: config.name,
          CFBundleExecutable: '$(EXECUTABLE_NAME)',
          CFBundleIdentifier: '$(PRODUCT_BUNDLE_IDENTIFIER)',
          CFBundleInfoDictionaryVersion: '6.0',
          CFBundleName: '$(PRODUCT_NAME)',
          CFBundlePackageType: '$(PRODUCT_BUNDLE_PACKAGE_TYPE)',
          // Must match the app's versions.
          CFBundleShortVersionString: config.version || '1.0.0',
          CFBundleVersion: config.ios?.buildNumber || '1',
          CrossshareAppGroup: appGroup(config),
          CrossshareHostScheme: hostScheme(config),
          NSExtension: {
            NSExtensionAttributes: {
              NSExtensionActivationRule: {
                NSExtensionActivationSupportsAttachmentsWithMaxCount: 100,
                NSExtensionActivationSupportsFileWithMaxCount: 100,
                NSExtensionActivationSupportsImageWithMaxCount: 100,
                NSExtensionActivationSupportsMovieWithMaxCount: 100,
                NSExtensionActivationSupportsText: true,
                NSExtensionActivationSupportsWebURLWithMaxCount: 1,
              },
            },
            NSExtensionPointIdentifier: 'com.apple.share-services',
            NSExtensionPrincipalClass: 'ShareViewController',
          },
        })
      );
      fs.writeFileSync(
        path.join(dir, `${SHARE_TARGET}.entitlements`),
        plist({ 'com.apple.security.application-groups': [appGroup(config)] })
      );
      return config;
    },
  ]);

const withShareExtensionTarget = (config) =>
  withXcodeProject(config, (config) => {
    const project = config.modResults;
    if (project.pbxTargetByName(SHARE_TARGET)) return config;

    const bundleId = `${config.ios?.bundleIdentifier}.share`;
    const mainTarget = project.getFirstTarget();
    const target = project.addTarget(SHARE_TARGET, 'app_extension', SHARE_TARGET, bundleId);
    project.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', target.uuid);
    project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target.uuid);
    project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid);

    const group = project.addPbxGroup([], SHARE_TARGET, SHARE_TARGET);
    project.addToPbxGroup(group.uuid, project.getFirstProject().firstProject.mainGroup);
    project.addSourceFile('ShareViewController.swift', { target: target.uuid }, group.uuid);
    project.addFile('Info.plist', group.uuid);
    project.addFile(`${SHARE_TARGET}.entitlements`, group.uuid);

    // Embed the extension before the app's script phases, or Xcode reports a dependency cycle.
    const phases = mainTarget.firstTarget.buildPhases;
    const embed = phases.findIndex((p) => p.comment === 'Copy Files');
    if (embed !== -1) {
      const [phase] = phases.splice(embed, 1);
      const resources = phases.findIndex((p) => p.comment === 'Resources');
      phases.splice(resources === -1 ? phases.length : resources + 1, 0, phase);
    }

    const mainSettings = buildSettingsOf(project, mainTarget.firstTarget);
    const team = config.ios?.appleTeamId || mainSettings?.DEVELOPMENT_TEAM;
    for (const settings of buildSettingsOf(project, target.pbxNativeTarget, true)) {
      Object.assign(settings, {
        INFOPLIST_FILE: `${SHARE_TARGET}/Info.plist`,
        CODE_SIGN_ENTITLEMENTS: `${SHARE_TARGET}/${SHARE_TARGET}.entitlements`,
        CODE_SIGN_STYLE: 'Automatic',
        PRODUCT_BUNDLE_IDENTIFIER: `"${bundleId}"`,
        IPHONEOS_DEPLOYMENT_TARGET: '15.1',
        TARGETED_DEVICE_FAMILY: '"1,2"',
        SWIFT_VERSION: '5.0',
        APPLICATION_EXTENSION_API_ONLY: 'YES',
        CLANG_ENABLE_MODULES: 'YES',
        GENERATE_INFOPLIST_FILE: 'NO',
        ...(team ? { DEVELOPMENT_TEAM: team } : {}),
      });
    }
    return config;
  });

/** Build settings of every configuration of a target (or the first one, unless `all`). */
function buildSettingsOf(project, nativeTarget, all = false) {
  const lists = project.pbxXCConfigurationList();
  const configs = project.pbxXCBuildConfigurationSection();
  const list = lists[nativeTarget.buildConfigurationList];
  const settings = (list?.buildConfigurations || []).map((c) => configs[c.value].buildSettings);
  return all ? settings : settings[0];
}

/** Minimal plist serializer (strings, numbers, booleans, arrays, dictionaries). */
function plist(value) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const node = (v, indent) => {
    const pad = '  '.repeat(indent);
    if (Array.isArray(v)) {
      return `${pad}<array>\n${v.map((x) => node(x, indent + 1)).join('')}${pad}</array>\n`;
    }
    if (typeof v === 'object') {
      const body = Object.entries(v)
        .map(([k, x]) => `${pad}  <key>${esc(k)}</key>\n${node(x, indent + 1)}`)
        .join('');
      return `${pad}<dict>\n${body}${pad}</dict>\n`;
    }
    if (typeof v === 'boolean') return `${pad}<${v}/>\n`;
    if (typeof v === 'number') return `${pad}<integer>${v}</integer>\n`;
    return `${pad}<string>${esc(v)}</string>\n`;
  };
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
    `<plist version="1.0">\n${node(value, 0)}</plist>\n`
  );
}

module.exports = withCrossshare;
