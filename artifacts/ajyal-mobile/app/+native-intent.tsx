// The native incoming-call screen hands the answer/decline choice to the app through
// ajyalalmaerifa://call-action?... . InternalCallContext reads that link itself, so the
// router must not try to open it as a screen (it showed "This screen doesn't exist").
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  if (typeof path === 'string' && path.includes('call-action')) return '/';
  return path;
}
