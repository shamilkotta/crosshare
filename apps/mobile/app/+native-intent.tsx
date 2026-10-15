// The iOS share extension opens crossshare://share; useIncomingShare loads what was shared.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  if (/^([\w+.-]+:\/\/)?\/?share(\?|\/|$)/.test(path)) return '/searching';
  return path;
}
