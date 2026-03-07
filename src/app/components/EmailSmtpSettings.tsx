import { useState, useEffect } from 'react';
import { getApiBase } from '../api/client';
import { fetchSmtpSettings, saveSmtpSettings, type SmtpSettingsPublic, type SmtpSettingsSave } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Mail, Info, CheckCircle } from 'lucide-react';

export function EmailSmtpSettings() {
  const [config, setConfig] = useState<SmtpSettingsPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [form, setForm] = useState<SmtpSettingsSave>({
    host: '',
    port: 587,
    username: '',
    password: '',
    from_email: '',
    use_tls: true,
  });

  const apiBase = getApiBase();

  useEffect(() => {
    if (!apiBase) {
      setConfig({ configured: false });
      setLoading(false);
      return;
    }
    fetchSmtpSettings()
      .then((data) => {
        setConfig(data);
        if (data.configured) {
          setForm((f) => ({
            ...f,
            host: data.host ?? '',
            port: data.port ?? 587,
            username: data.username ?? '',
            from_email: data.from_email ?? '',
            use_tls: data.use_tls ?? true,
          }));
        }
      })
      .catch(() => setConfig({ configured: false }))
      .finally(() => setLoading(false));
  }, [apiBase]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiBase) {
      setMessage({ type: 'error', text: 'Backend is not configured. Set VITE_API_BASE to enable email notifications.' });
      return;
    }
    if (!form.host.trim()) {
      setMessage({ type: 'error', text: 'SMTP host is required.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    saveSmtpSettings(form)
      .then((data) => {
        setConfig(data);
        setMessage({ type: 'success', text: 'SMTP settings saved. Notification emails will be sent when users receive in-app notifications.' });
      })
      .catch((err) => setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save.' }))
      .finally(() => setSaving(false));
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-slate-900">Email / SMTP Settings</h1>
        <p className="text-slate-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Email / SMTP Settings</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Configure an SMTP server to send notification emails to users (requisition status, pending approvals). When not configured, only in-app notifications are used.
        </p>
      </div>

      {!apiBase && (
        <Alert className="bg-amber-50 border-amber-200 text-amber-800 [&_svg]:text-amber-600">
          <Info className="size-4" />
          <AlertTitle>Backend required</AlertTitle>
          <AlertDescription>
            Set <code className="bg-amber-100 px-1 rounded">VITE_API_BASE</code> (e.g. <code className="bg-amber-100 px-1 rounded">http://localhost:8000</code>) to connect to the backend. Email sending is handled by the backend when SMTP is configured there.
          </AlertDescription>
        </Alert>
      )}

      {config?.configured && (
        <Alert className="bg-green-50 border-green-200 text-green-800 [&_svg]:text-green-600">
          <CheckCircle className="size-4" />
          <AlertTitle>Email notifications enabled</AlertTitle>
          <AlertDescription>
            Users will receive notification emails for requisitions requiring their attention and for status updates on their requests.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="size-4" />
            SMTP server details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {message && (
              <div
                className={`rounded-lg px-3 py-2 text-sm ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}
              >
                {message.text}
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-slate-700 text-sm font-medium mb-1">Host *</label>
                <Input
                  value={form.host}
                  onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
                  placeholder="smtp.example.com"
                  required
                  disabled={!apiBase}
                />
              </div>
              <div>
                <label className="block text-slate-700 text-sm font-medium mb-1">Port</label>
                <Input
                  type="number"
                  value={form.port}
                  onChange={(e) => setForm((f) => ({ ...f, port: parseInt(e.target.value, 10) || 587 }))}
                  placeholder="587"
                  disabled={!apiBase}
                />
              </div>
            </div>
            <div>
              <label className="block text-slate-700 text-sm font-medium mb-1">Username</label>
              <Input
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="Leave blank if not required"
                disabled={!apiBase}
              />
            </div>
            <div>
              <label className="block text-slate-700 text-sm font-medium mb-1">Password</label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Leave blank to keep existing"
                disabled={!apiBase}
                autoComplete="new-password"
              />
              <p className="text-slate-500 text-xs mt-1">Only enter to change; existing password is not shown.</p>
            </div>
            <div>
              <label className="block text-slate-700 text-sm font-medium mb-1">From email</label>
              <Input
                type="email"
                value={form.from_email}
                onChange={(e) => setForm((f) => ({ ...f, from_email: e.target.value }))}
                placeholder="noreply@yourcompany.com"
                disabled={!apiBase}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="use_tls"
                checked={form.use_tls}
                onChange={(e) => setForm((f) => ({ ...f, use_tls: e.target.checked }))}
                disabled={!apiBase}
                className="rounded border-slate-300"
              />
              <label htmlFor="use_tls" className="text-slate-700 text-sm">Use TLS (recommended for port 587)</label>
            </div>
            <div className="pt-2">
              <Button type="submit" disabled={!apiBase || saving}>
                {saving ? 'Saving…' : 'Save SMTP settings'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
