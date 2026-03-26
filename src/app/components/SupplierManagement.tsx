import { useEffect, useMemo, useState } from 'react';
import { bulkCreateSuppliers, createSupplier, fetchSuppliers, updateSupplier } from '../api/client';
import type { Supplier } from '../data/types';

function mapSupplier(s: any): Supplier {
  return {
    id: String(s.id),
    name: s.name || '',
    category: s.category || 'Other',
    physicalAddress: s.physical_address || '',
    contactEmail: s.contact_email || '',
    contactPerson: s.contact_person || '',
    active: Boolean(s.active),
    suspended: Boolean(s.suspended),
    createdAt: s.created_at || '',
    updatedAt: s.updated_at || '',
  };
}

export function SupplierManagement() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [bulkText, setBulkText] = useState('');
  const [draft, setDraft] = useState({
    name: '',
    category: 'Other',
    physicalAddress: '',
    contactEmail: '',
    contactPerson: '',
  });

  const parseCsvLine = (line: string, delimiter: string) => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (ch === delimiter && !inQuotes) {
        out.push(cur.trim());
        cur = '';
        continue;
      }
      cur += ch;
    }
    out.push(cur.trim());
    return out.map((v) => v.replace(/^"(.*)"$/, '$1').trim());
  };

  const normalizeHeader = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  const pickByHeader = (row: string[], headerMap: Record<string, number>, aliases: string[]) => {
    for (const alias of aliases) {
      const idx = headerMap[alias];
      if (idx != null && idx >= 0 && idx < row.length) return row[idx] || '';
    }
    return '';
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSuppliers({ page_size: '500' });
      setSuppliers((data.results || []).map(mapSupplier));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load suppliers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) =>
      `${s.name} ${s.category} ${s.contactPerson} ${s.contactEmail}`.toLowerCase().includes(q)
    );
  }, [search, suppliers]);

  const onAddSupplier = async () => {
    if (!draft.name.trim() || !draft.contactEmail.trim() || !draft.contactPerson.trim()) {
      setError('Name, contact email, and contact person are required.');
      return;
    }
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      await createSupplier({
        name: draft.name.trim(),
        category: draft.category,
        physical_address: draft.physicalAddress.trim(),
        contact_email: draft.contactEmail.trim(),
        contact_person: draft.contactPerson.trim(),
        active: true,
        suspended: false,
      });
      setDraft({ name: '', category: 'Other', physicalAddress: '', contactEmail: '', contactPerson: '' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add supplier.');
    } finally {
      setSaving(false);
    }
  };

  const onToggleSuspended = async (s: Supplier) => {
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      await updateSupplier(Number(s.id), { suspended: !s.suspended, active: s.suspended ? true : s.active });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update supplier.');
    } finally {
      setSaving(false);
    }
  };

  const parseCsvToRows = (csv: string) => {
    const lines = csv
      .split('\n')
      .map((x) => x.replace(/\r/g, '').trim())
      .filter(Boolean);
    if (!lines.length) return [];
    const delimiter = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
    const firstCols = parseCsvLine(lines[0], delimiter);
    const headerMap: Record<string, number> = {};
    firstCols.forEach((h, idx) => {
      headerMap[normalizeHeader(h)] = idx;
    });
    const hasHeader =
      Object.keys(headerMap).some((h) => h.includes('supplier name') || h === 'name') &&
      Object.keys(headerMap).some((h) => h.includes('category'));

    const dataLines = hasHeader ? lines.slice(1) : lines;
    return dataLines.map((line) => {
      const cols = parseCsvLine(line, delimiter);
      if (hasHeader) {
        const name = pickByHeader(cols, headerMap, ['name', 'supplier name']);
        const category = pickByHeader(cols, headerMap, ['category', 'supplier category']) || 'Other';
        const physicalAddress = pickByHeader(cols, headerMap, ['physical address', 'address', 'supplier address']);
        const contactEmail = pickByHeader(cols, headerMap, ['contact email', 'supplier contact email', 'email']);
        const contactPerson = pickByHeader(cols, headerMap, ['contact person', 'supplier contact person', 'person']);
        return {
          name,
          category,
          physical_address: physicalAddress,
          contact_email: contactEmail,
          contact_person: contactPerson,
          active: true,
          suspended: false,
        };
      }
      const [name = '', category = 'Other', physicalAddress = '', contactEmail = '', contactPerson = ''] = cols;
      return {
        name,
        category: category || 'Other',
        physical_address: physicalAddress,
        contact_email: contactEmail,
        contact_person: contactPerson,
        active: true,
        suspended: false,
      };
    }).filter((r) => r.name.trim() || r.contact_email.trim() || r.contact_person.trim());
  };

  const onBulkAdd = async () => {
    const rows = parseCsvToRows(bulkText);
    if (!rows.length) {
      setError('Paste at least one supplier row or include a CSV file.');
      return;
    }
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const res = await bulkCreateSuppliers({ suppliers: rows });
      setBulkText('');
      setInfo(`Imported ${res.created_count} supplier(s), skipped ${res.skipped_count} duplicate(s).`);
      if (res.duplicates?.length) {
        const sample = res.duplicates
          .slice(0, 5)
          .map((d) => `row ${d.row} (${(d.reasons || []).join('+')})`)
          .join(', ');
        setInfo(`Imported ${res.created_count} supplier(s), skipped ${res.skipped_count} duplicate(s): ${sample}${res.duplicates.length > 5 ? ', ...' : ''}`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed bulk add.');
    } finally {
      setSaving(false);
    }
  };

  const onBulkFileUpload = async (file: File) => {
    try {
      const text = await file.text();
      setBulkText(text);
    } catch {
      setError('Failed to read CSV file.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4">
        <h2 className="text-slate-900 font-semibold text-lg">Suppliers</h2>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">{error}</div>}
        {info && <div className="text-sm text-green-700 bg-green-50 border border-green-100 px-3 py-2 rounded-lg">{info}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Supplier name" className="px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          <input value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))} placeholder="Category" className="px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          <input value={draft.physicalAddress} onChange={(e) => setDraft((d) => ({ ...d, physicalAddress: e.target.value }))} placeholder="Physical address" className="px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          <input value={draft.contactEmail} onChange={(e) => setDraft((d) => ({ ...d, contactEmail: e.target.value }))} placeholder="Contact email" className="px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          <input value={draft.contactPerson} onChange={(e) => setDraft((d) => ({ ...d, contactPerson: e.target.value }))} placeholder="Contact person" className="px-3 py-2 border border-slate-200 rounded-lg text-sm" />
        </div>
        <button disabled={saving} onClick={onAddSupplier} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm disabled:opacity-60">
          Add supplier
        </button>
        <div className="pt-2 border-t border-slate-100">
          <div className="text-sm text-slate-700 mb-2">Bulk add suppliers (CSV per line: name,category,physical_address,contact_email,contact_person)</div>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.currentTarget.value = '';
              if (f) onBulkFileUpload(f);
            }}
            className="block w-full text-sm text-slate-700 mb-2"
          />
          <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} className="w-full min-h-[100px] px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          <button disabled={saving} onClick={onBulkAdd} className="mt-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-sm disabled:opacity-60">
            Bulk add
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-slate-900 font-semibold">All Suppliers</h3>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search suppliers..." className="px-3 py-2 border border-slate-200 rounded-lg text-sm w-full max-w-xs" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-2 text-xs text-slate-500 uppercase">Name</th>
                <th className="text-left px-4 py-2 text-xs text-slate-500 uppercase">Category</th>
                <th className="text-left px-4 py-2 text-xs text-slate-500 uppercase">Contact</th>
                <th className="text-left px-4 py-2 text-xs text-slate-500 uppercase">Email</th>
                <th className="text-left px-4 py-2 text-xs text-slate-500 uppercase">Address</th>
                <th className="text-left px-4 py-2 text-xs text-slate-500 uppercase">Status</th>
                <th className="text-left px-4 py-2 text-xs text-slate-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2 text-sm text-slate-800">{s.name}</td>
                  <td className="px-4 py-2 text-sm text-slate-700">{s.category}</td>
                  <td className="px-4 py-2 text-sm text-slate-700">{s.contactPerson}</td>
                  <td className="px-4 py-2 text-sm text-slate-700">{s.contactEmail}</td>
                  <td className="px-4 py-2 text-sm text-slate-700">{s.physicalAddress || '—'}</td>
                  <td className="px-4 py-2 text-sm">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${s.suspended ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      {s.suspended ? 'Suspended' : 'Active'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm">
                    <button onClick={() => onToggleSuspended(s)} className="px-3 py-1 rounded border border-slate-200 hover:bg-slate-50 text-xs">
                      {s.suspended ? 'Unsuspend' : 'Suspend'}
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-sm text-slate-500">No suppliers found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
