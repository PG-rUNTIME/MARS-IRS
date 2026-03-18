import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { MarsLogo } from './shared/MarsLogo';
import { ClipboardList, FileText, LineChart, Lock } from 'lucide-react';

interface LoginPageProps {
  onLogin: () => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (result.success) {
      onLogin();
    } else {
      setError(result.error || 'Login failed.');
    }
  };

  return (
    <div className="min-h-screen flex bg-mars-navy" style={{ background: 'linear-gradient(135deg, var(--mars-navy) 0%, var(--mars-navy-light) 50%, var(--mars-navy) 100%)' }}>
      {/* Left Panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.07]">
          <div className="absolute top-0 left-0 w-96 h-96 rounded-full bg-mars-red -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-mars-red translate-x-1/4 translate-y-1/4" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <MarsLogo size="lg" className="rounded-xl" />
            <div>
              <div className="text-white text-lg font-bold tracking-wide">MARS</div>
              <div className="text-white/70 text-xs tracking-widest uppercase">Ambulance Services</div>
            </div>
          </div>
          <h1 className="text-white mb-4" style={{ fontSize: '2.5rem', fontWeight: 700, lineHeight: 1.2 }}>
            Internal<br />Requisitions<br />
            <span className="text-mars-red">System</span>
          </h1>
          <p className="text-white/70 text-base leading-relaxed max-w-sm">
            A centralised platform for managing procurement requisitions, approvals, and financial control across all MARS departments.
          </p>
        </div>
        <div className="relative z-10 grid grid-cols-2 gap-4">
          {[
            { Icon: Lock, label: 'Role-Based Access', desc: 'Secure, permission-controlled views' },
            { Icon: ClipboardList, label: 'Multi-Level Approvals', desc: 'Automated workflow routing' },
            { Icon: LineChart, label: 'Real-Time Tracking', desc: 'Live status & audit trail' },
            { Icon: FileText, label: 'PO Generation', desc: 'Automated purchase orders' },
          ].map((item) => (
            <div key={item.label} className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="mb-2">
                <item.Icon className="h-6 w-6 text-white" aria-hidden />
              </div>
              <div className="text-white text-sm font-medium">{item.label}</div>
              <div className="text-white/60 text-xs mt-1">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <MarsLogo size="md" className="rounded-xl" />
            <div>
              <div className="text-mars-navy text-base font-bold">MARS Ambulance Services</div>
              <div className="text-muted-foreground text-xs">Requisitions System</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-8 pt-8 pb-6">
              <h2 className="text-foreground mb-1" style={{ fontSize: '1.5rem', fontWeight: 700 }}>Sign In</h2>
              <p className="text-muted-foreground text-sm">Use your MARS credentials to access the system.</p>
            </div>

            <form onSubmit={handleSubmit} className="px-8 pb-6 space-y-5">
              {error && (
                <div className="bg-mars-red-muted border border-mars-red/30 rounded-lg px-4 py-3 flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--mars-red)" strokeWidth="2" className="shrink-0">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12" y2="16"/>
                  </svg>
                  <span className="text-mars-red-dark text-sm">{error}</span>
                </div>
              )}
              <div>
                <label className="block text-foreground text-sm mb-1.5">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user email"
                  required
                  className="w-full px-4 py-2.5 rounded-lg border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-mars-red/30 focus:border-mars-red transition-all"
                />
              </div>
              <div>
                <label className="block text-foreground text-sm mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full px-4 py-2.5 rounded-lg border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-mars-red/30 focus:border-mars-red transition-all"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg text-white text-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-60 bg-mars-red hover:bg-mars-red-dark"
                style={loading ? { background: 'var(--mars-red-dark)' } : undefined}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.3"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                    Signing in...
                  </>
                ) : 'Sign In'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
