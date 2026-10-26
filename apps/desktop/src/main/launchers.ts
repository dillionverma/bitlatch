const browsers = [
  { identifier: 'com.google.Chrome', team: 'EQHXZ8M8AV', name: 'Google Chrome' },
  { identifier: 'com.google.chrome.for.testing', team: 'EQHXZ8M8AV', name: 'Chrome for Testing' },
  { identifier: 'org.mozilla.firefox', team: '43AQ936H96', name: 'Firefox' },
  { identifier: 'com.brave.Browser', team: 'KL8N8XSYF4', name: 'Brave' },
  { identifier: 'com.microsoft.edgemac', team: 'UBF8T346G9', name: 'Microsoft Edge' },
  { identifier: 'company.thebrowser.Browser', team: 'S6N382Y83G', name: 'Arc' },
  { identifier: 'com.vivaldi.Vivaldi', team: '4XF3XNRN6Y', name: 'Vivaldi' },
  { identifier: 'at.studio.AsideBrowser', team: '8CPD4K4TBB', name: 'Aside' },
];
const raycast = { identifier: 'com.raycast.macos', team: 'SY64MV22J9', name: 'Raycast' };

const requirement = (launchers: (typeof browsers)[number][]) =>
  launchers
    .map(
      ({ identifier, team }) =>
        `(identifier "${identifier}" and anchor apple generic and certificate leaf[subject.OU] = "${team}")`,
    )
    .join(' or ');

// Browsers launch relays themselves. Raycast runs extensions in a Node child that launches
// the relay, so its requirement names the launcher's parent.
export const launcherPolicies = {
  browser: { requirement: requirement(browsers), namesLauncherParent: false },
  raycast: { requirement: requirement([raycast]), namesLauncherParent: true },
};

export const launcherName = (identifier: string | null) =>
  [...browsers, raycast].find((launcher) => launcher.identifier === identifier)?.name ??
  'an unrecognized app';
