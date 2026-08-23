import type { ExtensionConnectionState } from './extension-bridge';

export type WorkspaceStartupState = 'BOOTING' | 'CHECKING_AUTH' | 'CHECKING_EXTENSION' | 'CONNECTING' | 'LOADING_AUDIT' | 'READY' | 'NO_EXTENSION' | 'NO_AUDIT' | 'ERROR';

export function workspaceStartupState(input: { authLoading: boolean; authenticated: boolean; loadingAudits: boolean; routeAuditId: string | null; extension: ExtensionConnectionState; auditCount: number; error: string | null }): WorkspaceStartupState {
  if (input.authLoading) return 'CHECKING_AUTH';
  if (!input.authenticated) return 'BOOTING';
  if (input.error) return 'ERROR';
  if (input.extension === 'connecting') return 'CONNECTING';
  if (input.extension === 'unknown') return 'CHECKING_EXTENSION';
  if (input.loadingAudits || input.routeAuditId) return 'LOADING_AUDIT';
  if (input.extension === 'connected') return input.auditCount ? 'READY' : 'NO_AUDIT';
  return 'NO_EXTENSION';
}
