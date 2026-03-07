import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatDate } from './shared/StatusBadge';
import type { User, UserRole } from '../data/types';
import { ROLE_CAPABILITIES } from '../data/roleCapabilities';

const ROLES: UserRole[] = ['Requester', 'Department Manager', 'Accountant', 'General Manager', 'Financial Controller', 'Head of Operations', 'System Administrator', 'Auditor'];
const DEPARTMENTS = ['Operations', 'Logistics', 'Human Resources', 'Finance', 'Administration', 'Medical/Clinical', 'Information Technology', 'Management', 'Compliance'];

const ROLE_COLORS: Record<UserRole, string> = {
  'Requester': 'bg-blue-100 text-blue-700',
  'Department Manager': 'bg-purple-100 text-purple-700',
  'Accountant': 'bg-yellow-100 text-yellow-700',
  'General Manager': 'bg-orange-100 text-orange-700',
  'Financial Controller': 'bg-red-100 text-red-700',
  'Head of Operations': 'bg-green-100 text-green-700',
  'System Administrator': 'bg-slate-100 text-slate-700',
  'Auditor': 'bg-teal-100 text-teal-700',
};

const EMPTY_USER: Omit<User, 'id'> = {
  name: '', email: '', password: 'mars2026', roles: ['Requester'],
  department: 'Operations', active: true, joinedDate: new Date().toISOString().split('T')[0],
};

export function UserManagement() {
  const { users, updateUser, toggleUserActive, addUser } = useApp();
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<User>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [newUser, setNewUser] = useState<Omit<User, 'id'>>(EMPTY_USER);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const filtered = users.filter((u) => {
    if (search && !u.name.toLowerCase().includes(search.toLowerCase()) && !u.email.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterRole && !u.roles.includes(filterRole as UserRole)) return false;
    return true;
  });

  const handleEditSave = async (id: string) => {
    const errs: Record<string, string> = {};
    if (!editData.name?.trim()) errs.name = 'Name is required.';
    if (!editData.email?.trim()) errs.email = 'Email is required.';
    if (editData.roles !== undefined && editData.roles.length === 0) errs.roles = 'At least one role is required.';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    await updateUser(id, editData);
    setEditingId(null);
    setEditData({});
    setErrors({});
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleAdd = async () => {
    const errs: Record<string, string> = {};
    if (!newUser.name.trim()) errs.name = 'Name is required.';
    if (!newUser.email.trim()) errs.email = 'Email is required.';
    if (!newUser.roles.length) errs.roles = 'Select at least one role.';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    await addUser(newUser);
    setShowAdd(false);
    setNewUser(EMPTY_USER);
    setErrors({});
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const inputCls = 'w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-red-300 bg-white';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-slate-900">User Management</h1>
          <p className="text-slate-500 text-sm">{users.length} system users · {users.filter((u) => u.active).length} active</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-all hover:opacity-90 bg-mars-red hover:bg-mars-red-dark"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add User
        </button>
      </div>

      {saved && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2 text-green-800 text-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
          Changes saved successfully.
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email…" className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-red-300" />
          </div>
          <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white focus:outline-none min-w-[160px]">
            <option value="">All Roles</option>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['User', 'Email', 'Roles', 'Department', 'Joined', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((user) => {
                const isEditing = editingId === user.id;
                return (
                  <tr key={user.id} className={`hover:bg-slate-50 transition-colors ${!user.active ? 'opacity-60' : ''}`}>
                    <td className="px-5 py-3.5">
                      {isEditing ? (
                        <div>
                          <input value={editData.name ?? user.name} onChange={(e) => setEditData((d) => ({ ...d, name: e.target.value }))} className={inputCls} />
                          {errors.name && <p className="text-red-500 text-xs mt-0.5">{errors.name}</p>}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 bg-mars-red">
                            {user.name.split(' ').map((n) => n[0]).join('')}
                          </div>
                          <span className="text-slate-800 text-sm font-medium">{user.name}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 text-sm">
                      {isEditing ? (
                        <input value={editData.email ?? user.email} onChange={(e) => setEditData((d) => ({ ...d, email: e.target.value }))} className={inputCls} />
                      ) : user.email}
                    </td>
                    <td className="px-5 py-3.5">
                      {isEditing ? (
                        <div className="flex flex-wrap gap-2">
                          {ROLES.map((r) => {
                            const currentRoles = editData.roles ?? user.roles;
                            const checked = currentRoles.includes(r);
                            return (
                              <label key={r} className="flex items-center gap-1.5 text-xs cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {
                                    const next = checked ? currentRoles.filter((x) => x !== r) : [...currentRoles, r];
                                    setEditData((d) => ({ ...d, roles: next }));
                                  }}
                                  className="rounded border-slate-300 accent-mars-red"
                                />
                                <span className={ROLE_COLORS[r]}>{r}</span>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {user.roles.map((r) => (
                            <span key={r} className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[r]}`}>{r}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 text-sm">
                      {isEditing ? (
                        <select value={editData.department ?? user.department} onChange={(e) => setEditData((d) => ({ ...d, department: e.target.value }))} className={inputCls}>
                          {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                      ) : user.department}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 text-xs">{formatDate(user.joinedDate)}</td>
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => void toggleUserActive(user.id)}
                        className={`text-xs px-2.5 py-1 rounded-full font-medium cursor-pointer transition-all ${user.active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}
                      >
                        {user.active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-5 py-3.5">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleEditSave(user.id)} className="text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-all">Save</button>
                          <button onClick={() => { setEditingId(null); setEditData({}); setErrors({}); }} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingId(user.id); setEditData({ name: user.name, email: user.email, roles: user.roles, department: user.department }); }}
                          className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-800 transition-all"
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Role capabilities (admin assigns roles; each role grants specific capabilities) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h3 className="text-slate-800 mb-3">Role capabilities</h3>
        <p className="text-slate-600 text-sm mb-3">Users can be assigned one or more roles. Capabilities are combined from all assigned roles.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ROLES.map((role) => (
            <div key={role} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${ROLE_COLORS[role]}`}>{role}</span>
              <span className="text-slate-600 text-xs leading-relaxed">{ROLE_CAPABILITIES[role]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Add User Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h3 className="text-slate-800 mb-4">Add New User</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-slate-700 text-sm mb-1.5">Full Name <span className="text-red-500">*</span></label>
                <input value={newUser.name} onChange={(e) => setNewUser((u) => ({ ...u, name: e.target.value }))} placeholder="e.g. Jane Smith" className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none ${errors.name ? 'border-red-400' : 'border-slate-200'}`} />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
              </div>
              <div>
                <label className="block text-slate-700 text-sm mb-1.5">Email Address <span className="text-red-500">*</span></label>
                <input type="email" value={newUser.email} onChange={(e) => setNewUser((u) => ({ ...u, email: e.target.value }))} placeholder="user email" className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none ${errors.email ? 'border-red-400' : 'border-slate-200'}`} />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
              </div>
              <div>
                <label className="block text-slate-700 text-sm mb-1.5">Roles <span className="text-red-500">*</span></label>
                <p className="text-slate-500 text-xs mb-2">Select one or more roles. The user will have the combined capabilities of all selected roles.</p>
                <div className="flex flex-wrap gap-3 p-3 border border-slate-200 rounded-lg bg-slate-50/50">
                  {ROLES.map((r) => {
                    const checked = newUser.roles.includes(r);
                    return (
                      <label key={r} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setNewUser((u) => ({
                              ...u,
                              roles: checked ? u.roles.filter((x) => x !== r) : [...u.roles, r],
                            }));
                          }}
                          className="rounded border-slate-300 accent-mars-red"
                        />
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[r]}`}>{r}</span>
                      </label>
                    );
                  })}
                </div>
                {errors.roles && <p className="text-red-500 text-xs mt-1">{errors.roles}</p>}
              </div>
              <div>
                <label className="block text-slate-700 text-sm mb-1.5">Department</label>
                <select value={newUser.department} onChange={(e) => setNewUser((u) => ({ ...u, department: e.target.value }))} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none">
                  {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-slate-700 text-sm mb-1.5">Phone (optional)</label>
                <input value={newUser.phone || ''} onChange={(e) => setNewUser((u) => ({ ...u, phone: e.target.value }))} placeholder="+263 77 000 0000" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none" />
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                Default password will be <span className="font-mono font-medium">mars2026</span>. User should change on first login.
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => { setShowAdd(false); setNewUser(EMPTY_USER); setErrors({}); }} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-slate-600 text-sm hover:bg-slate-50">Cancel</button>
              <button onClick={handleAdd} className="flex-1 px-4 py-2.5 rounded-lg text-white text-sm font-medium transition-all hover:opacity-90 bg-mars-red hover:bg-mars-red-dark">Create User</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
