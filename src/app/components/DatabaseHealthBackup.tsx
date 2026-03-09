import { useState, useEffect, useCallback } from 'react';
import {
  fetchDatabaseHealth,
  fetchBackupList,
  createBackup,
  restoreBackup,
  type BackupItem,
} from '../api/client';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DatabaseHealthBackup() {
  const [health, setHealth] = useState<{ status: string; database?: string; version?: string; error?: string } | null>(null);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [loadingHealth, setLoadingHealth] = useState(true);
  const [loadingBackups, setLoadingBackups] = useState(true);
  const [backupName, setBackupName] = useState('');
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState<string | null>(null);

  const loadHealth = useCallback(async () => {
    setLoadingHealth(true);
    try {
      const data = await fetchDatabaseHealth();
      setHealth(data);
    } catch (e) {
      setHealth({ status: 'error', error: String(e) });
    } finally {
      setLoadingHealth(false);
    }
  }, []);

  const loadBackups = useCallback(async () => {
    setLoadingBackups(true);
    try {
      const data = await fetchBackupList();
      setBackups(data.backups);
    } catch (e) {
      setBackups([]);
      setMessage({ type: 'error', text: `Failed to list backups: ${e}` });
    } finally {
      setLoadingBackups(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  useEffect(() => {
    loadBackups();
  }, [loadBackups]);

  const handleCreateBackup = async () => {
    setCreating(true);
    setMessage(null);
    try {
      await createBackup(backupName.trim() || undefined);
      setBackupName('');
      setMessage({ type: 'success', text: 'Backup created successfully.' });
      loadBackups();
    } catch (e) {
      setMessage({ type: 'error', text: String(e) });
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async (filename: string) => {
    setRestoring(filename);
    setMessage(null);
    setRestoreConfirm(null);
    try {
      await restoreBackup(filename);
      setMessage({ type: 'success', text: 'Database restored successfully. You may need to refresh the page.' });
    } catch (e) {
      setMessage({ type: 'error', text: String(e) });
    } finally {
      setRestoring(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-foreground">Database Health & Backup</h1>
        <p className="text-muted-foreground text-sm">View database health and create or restore backups to the named volume.</p>
      </div>

      {message && (
        <div
          className={`rounded-xl p-4 text-sm ${
            message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-mars-red-muted border border-mars-red/30 text-mars-red-dark'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Health */}
      <div className="bg-white rounded-xl border border-border shadow-sm p-6">
        <h2 className="text-foreground font-semibold mb-3">Database Health</h2>
        {loadingHealth ? (
          <p className="text-muted-foreground text-sm">Checking…</p>
        ) : health ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span
                className={`w-3 h-3 rounded-full ${health.status === 'ok' ? 'bg-green-500' : 'bg-red-500'}`}
                aria-hidden
              />
              <span className="text-sm font-medium">{health.status === 'ok' ? 'Connected' : 'Error'}</span>
            </div>
            {health.status === 'ok' && (
              <>
                {health.database && <p className="text-muted-foreground text-sm">Database: {health.database}</p>}
                {health.version && (
                  <p className="text-muted-foreground text-xs font-mono break-all">{health.version}</p>
                )}
              </>
            )}
            {health.error && <p className="text-mars-red text-sm">{health.error}</p>}
            <button
              type="button"
              onClick={loadHealth}
              className="mt-2 text-sm text-mars-red hover:underline"
            >
              Refresh health
            </button>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No data</p>
        )}
      </div>

      {/* Create backup */}
      <div className="bg-white rounded-xl border border-border shadow-sm p-6">
        <h2 className="text-foreground font-semibold mb-3">Create Backup</h2>
        <p className="text-muted-foreground text-sm mb-4">
          Create a full backup of the database. It will be saved to the named volume (e.g. <code className="bg-muted px-1 rounded">pg_backups</code>).
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px]">
            <label className="block text-sm text-muted-foreground mb-1">Backup name (optional)</label>
            <input
              type="text"
              value={backupName}
              onChange={(e) => setBackupName(e.target.value)}
              placeholder="e.g. pre-release"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-mars-red"
            />
          </div>
          <button
            type="button"
            onClick={handleCreateBackup}
            disabled={creating}
            className="px-4 py-2 rounded-lg text-white text-sm font-medium bg-mars-red hover:bg-mars-red-dark disabled:opacity-60"
          >
            {creating ? 'Creating…' : 'Create backup'}
          </button>
        </div>
      </div>

      {/* Backup list & restore */}
      <div className="bg-white rounded-xl border border-border shadow-sm p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-foreground font-semibold">Backups</h2>
          <button type="button" onClick={loadBackups} className="text-sm text-mars-red hover:underline">
            Refresh list
          </button>
        </div>
        {loadingBackups ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : backups.length === 0 ? (
          <p className="text-muted-foreground text-sm">No backups found in the volume.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 text-muted-foreground font-medium">Filename</th>
                  <th className="text-left py-2 text-muted-foreground font-medium">Size</th>
                  <th className="text-left py-2 text-muted-foreground font-medium">Created</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {backups.map((b) => (
                  <tr key={b.filename}>
                    <td className="py-3 font-mono text-xs">{b.filename}</td>
                    <td className="py-3 text-muted-foreground">{formatBytes(b.size_bytes)}</td>
                    <td className="py-3 text-muted-foreground">{formatDate(b.created)}</td>
                    <td className="py-3 text-right">
                      {restoreConfirm === b.filename ? (
                        <span className="flex items-center justify-end gap-2">
                          <span className="text-amber-700 text-xs">Restore this? </span>
                          <button
                            type="button"
                            onClick={() => handleRestore(b.filename)}
                            disabled={restoring !== null}
                            className="text-xs px-2 py-1 rounded bg-mars-red text-white hover:bg-mars-red-dark disabled:opacity-60"
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() => setRestoreConfirm(null)}
                            className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:bg-muted"
                          >
                            No
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setRestoreConfirm(b.filename)}
                          disabled={restoring !== null}
                          className="text-xs px-2 py-1.5 rounded border border-mars-red text-mars-red hover:bg-mars-red-muted disabled:opacity-60"
                        >
                          {restoring === b.filename ? 'Restoring…' : 'Restore'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {backups.length > 0 && (
          <p className="text-amber-700 text-xs mt-3">
            Restoring replaces the current database with the backup. This action cannot be undone.
          </p>
        )}
      </div>
    </div>
  );
}
