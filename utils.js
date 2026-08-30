export const rupiah = n => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n || 0));

export const formatMoneyInput = value => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(digits)) : '';
};

export const parseMoneyInput = value => Number(String(value ?? '').replace(/\D/g, '') || 0);

export const initials = name => (name || '?').split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();

export const today = () => {
  const d = new Date();
  return isoDate(d);
};

export const parseDateLocal = value => {
  const [y, m, d] = String(value).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const isoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const daysInMonth = (year, monthIndex) => new Date(year, monthIndex + 1, 0).getDate();

export const monthDueDate = (year, monthIndex, day) => {
  return isoDate(new Date(year, monthIndex, Math.min(day, daysInMonth(year, monthIndex))));
};

export const addMonthsDate = (dateValue, months) => {
  const d = parseDateLocal(dateValue);
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  return monthDueDate(target.getFullYear(), target.getMonth(), d.getDate());
};

export const roundDownTo1k = value => Math.max(0, Math.floor(Number(value || 0) / 1000) * 1000);

export const overdueDays = dueDate => {
  const d = parseDateLocal(dueDate);
  const t = parseDateLocal(today());
  return Math.max(0, Math.floor((t - d) / 86400000));
};

export const csvEscape = value => {
  const s = String(value ?? '');
  return `"${s.replaceAll('"', '""')}"`;
};

export const downloadCSV = (filename, headers, rows) => {
  const csv = '\uFEFF' + [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
