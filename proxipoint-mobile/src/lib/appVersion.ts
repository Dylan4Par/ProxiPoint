/**
 * "ProxiPoint v1.0.0 (Build 42)": the footer under Settings → Help, and support emails.
 * Version is app.json's "version"; the build is ios.buildNumber / android.versionCode (bump
 * them with each store upload, or let EAS do it with autoIncrement).
 */
export function appVersionLabel(version: string | null | undefined, build: string | number | null | undefined): string {
  const v = version ? `v${version}` : 'version unknown';
  return build != null && String(build) !== '' ? `ProxiPoint ${v} (Build ${build})` : `ProxiPoint ${v}`;
}
