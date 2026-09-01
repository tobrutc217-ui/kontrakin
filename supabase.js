import { createClient } from '@supabase/supabase-js';

const supabaseUrl = typeof import.meta.env !== 'undefined' ? import.meta.env.VITE_SUPABASE_URL : undefined;
const supabaseAnonKey = typeof import.meta.env !== 'undefined' ? import.meta.env.VITE_SUPABASE_ANON_KEY : undefined;

// --- High-Fidelity local-storage/in-memory mock database ---
const getTable = (name) => {
  const data = localStorage.getItem(`kos_db_${name}`);
  if (data) {
    try { return JSON.parse(data); } catch (e) { return []; }
  }
  
  // Default mockup data for professional presentation
  if (name === 'properties') {
    return [
      { id: 'prop-1', name: 'Kos Cendana', address: 'Jl. Cendana No. 12, Jakarta', payment_name: 'Ryan Putra Pratama', payment_bca: '0571288191', payment_dana: '08816585970', payment_gopay: '085161174317', created_at: new Date().toISOString() }
    ];
  }
  if (name === 'rooms') {
    return [
      { id: 'room-1', property_id: 'prop-1', room_number: '101', monthly_rate: 1500000, status: 'occupied', created_at: new Date().toISOString() },
      { id: 'room-2', property_id: 'prop-1', room_number: '102', monthly_rate: 1500000, status: 'vacant', created_at: new Date().toISOString() },
      { id: 'room-3', property_id: 'prop-1', room_number: '103', monthly_rate: 1800000, status: 'occupied', created_at: new Date().toISOString() },
      { id: 'room-4', property_id: 'prop-1', room_number: '104', monthly_rate: 2000000, status: 'maintenance', created_at: new Date().toISOString() }
    ];
  }
  if (name === 'tenants') {
    return [
      { id: 'tenant-1', room_id: 'room-1', full_name: 'Budi Santoso', email: 'budi@gmail.com', whatsapp_number: '6281234567890', id_card_number: '3171234567890001', lease_start: '2026-01-10', lease_end: '', billing_day: 10, created_at: new Date().toISOString() },
      { id: 'tenant-2', room_id: 'room-3', full_name: 'Siti Aminah', email: 'siti@gmail.com', whatsapp_number: '6289876543210', id_card_number: '3171234567890002', lease_start: '2026-03-15', lease_end: '', billing_day: 15, created_at: new Date().toISOString() }
    ];
  }
  if (name === 'invoices') {
    return [
      { id: 'inv-1', tenant_id: 'tenant-1', room_id: 'room-1', due_date: '2026-07-10', amount: 1500000, paid_amount: 1500000, status: 'paid', paid_at: '2026-07-10T09:00:00Z', created_at: new Date().toISOString() },
      { id: 'inv-2', tenant_id: 'tenant-1', room_id: 'room-1', due_date: '2026-08-10', amount: 1500000, paid_amount: 0, status: 'unpaid', created_at: new Date().toISOString() },
      { id: 'inv-3', tenant_id: 'tenant-2', room_id: 'room-3', due_date: '2026-07-15', amount: 1800000, paid_amount: 1800000, status: 'paid', paid_at: '2026-07-15T10:00:00Z', created_at: new Date().toISOString() },
      { id: 'inv-4', tenant_id: 'tenant-2', room_id: 'room-3', due_date: '2026-08-15', amount: 1800000, paid_amount: 1000000, status: 'unpaid', created_at: new Date().toISOString() }
    ];
  }
  if (name === 'transactions') {
    return [
      { id: 'tx-1', property_id: 'prop-1', category: 'Sewa Kamar', description: 'Pembayaran Budi Santoso · Kamar 101', amount: 1500000, transaction_date: '2026-07-10', created_at: new Date().toISOString() },
      { id: 'tx-2', property_id: 'prop-1', category: 'Sewa Kamar', description: 'Pembayaran Siti Aminah · Kamar 103', amount: 1800000, transaction_date: '2026-07-15', created_at: new Date().toISOString() },
      { id: 'tx-3', property_id: 'prop-1', category: 'Sewa Kamar', description: 'Pembayaran Siti Aminah · Kamar 103 (Sebagian)', amount: 1000000, transaction_date: '2026-08-15', created_at: new Date().toISOString() }
    ];
  }
  return [];
};

const setTable = (name, data) => {
  localStorage.setItem(`kos_db_${name}`, JSON.stringify(data));
};

class SupabaseQueryBuilder {
  constructor(table) {
    this.table = table;
    this.data = getTable(table);
    this.filters = [];
    this.orderByField = null;
    this.orderAscending = true;
    this.limitCount = null;
    this._single = false;
    this.action = 'select';
    this.payload = null;
    this.upsertOptions = {};
  }

  select(columns) {
    return this;
  }

  order(field, options = {}) {
    this.orderByField = field;
    this.orderAscending = options.ascending !== false;
    return this;
  }

  limit(count) {
    this.limitCount = count;
    return this;
  }

  eq(field, value) {
    this.filters.push(item => item[field] === value);
    return this;
  }

  lt(field, value) {
    this.filters.push(item => String(item[field]) < String(value));
    return this;
  }

  in(field, values) {
    const set = new Set(values);
    this.filters.push(item => set.has(item[field]));
    return this;
  }

  single() {
    this._single = true;
    return this;
  }

  insert(payload) {
    this.action = 'insert';
    this.payload = payload;
    return this;
  }

  update(payload) {
    this.action = 'update';
    this.payload = payload;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  upsert(payload, options = {}) {
    this.action = 'upsert';
    this.payload = payload;
    this.upsertOptions = options;
    return this;
  }

  then(onfulfilled, onrejected) {
    return this.execute().then(onfulfilled, onrejected);
  }

  async execute() {
    let result = [...this.data];

    if (this.action === 'select') {
      for (const filter of this.filters) {
        result = result.filter(filter);
      }
      if (this.orderByField) {
        result.sort((a, b) => {
          const valA = a[this.orderByField];
          const valB = b[this.orderByField];
          if (valA == null) return 1;
          if (valB == null) return -1;
          if (typeof valA === 'string') {
            return this.orderAscending ? valA.localeCompare(valB) : valB.localeCompare(valA);
          }
          return this.orderAscending ? valA - valB : valB - valA;
        });
      }
      if (this.limitCount !== null) {
        result = result.slice(0, this.limitCount);
      }
      if (this._single) {
        return { data: result[0] || null, error: null };
      }
      return { data: result, error: null };
    }

    if (this.action === 'insert') {
      const items = Array.isArray(this.payload) ? this.payload : [this.payload];
      const created = items.map(item => ({
        id: item.id || `${this.table}-${Math.random().toString(36).substr(2, 9)}`,
        created_at: new Date().toISOString(),
        ...item
      }));
      this.data.push(...created);
      setTable(this.table, this.data);
      const output = Array.isArray(this.payload) ? created : created[0];
      if (this._single) {
        return { data: Array.isArray(output) ? output[0] || null : output, error: null };
      }
      return { data: output, error: null };
    }

    if (this.action === 'update') {
      let matched = [...this.data];
      for (const filter of this.filters) {
        matched = matched.filter(filter);
      }
      const matchedIds = new Set(matched.map(m => m.id));
      this.data = this.data.map(item => {
        if (matchedIds.has(item.id)) {
          return { ...item, ...this.payload };
        }
        return item;
      });
      setTable(this.table, this.data);
      const updated = matched.map(m => ({ ...m, ...this.payload }));
      if (this._single) {
        return { data: updated[0] || null, error: null };
      }
      return { data: updated, error: null };
    }

    if (this.action === 'delete') {
      let matched = [...this.data];
      for (const filter of this.filters) {
        matched = matched.filter(filter);
      }
      const matchedIds = new Set(matched.map(m => m.id));
      this.data = this.data.filter(item => !matchedIds.has(item.id));
      setTable(this.table, this.data);
      if (this._single) {
        return { data: matched[0] || null, error: null };
      }
      return { data: matched, error: null };
    }

    if (this.action === 'upsert') {
      const payload = this.payload;
      const options = this.upsertOptions || {};
      const items = Array.isArray(payload) ? payload : [payload];
      const onConflict = options.onConflict ? options.onConflict.split(',') : [];
      const ignoreDuplicates = options.ignoreDuplicates === true;

      const updatedOrInserted = [];
      for (const item of items) {
        let matchIdx = -1;
        if (onConflict.length > 0) {
          matchIdx = this.data.findIndex(existing => 
            onConflict.every(field => String(existing[field]) === String(item[field]))
          );
        } else if (item.id) {
          matchIdx = this.data.findIndex(existing => existing.id === item.id);
        }

        if (matchIdx !== -1) {
          if (!ignoreDuplicates) {
            this.data[matchIdx] = { ...this.data[matchIdx], ...item };
            updatedOrInserted.push(this.data[matchIdx]);
          } else {
            updatedOrInserted.push(this.data[matchIdx]);
          }
        } else {
          const newItem = {
            id: item.id || `${this.table}-${Math.random().toString(36).substr(2, 9)}`,
            created_at: new Date().toISOString(),
            ...item
          };
          this.data.push(newItem);
          updatedOrInserted.push(newItem);
        }
      }
      setTable(this.table, this.data);
      const output = Array.isArray(payload) ? updatedOrInserted : updatedOrInserted[0];
      if (this._single) {
        return { data: Array.isArray(output) ? output[0] || null : output, error: null };
      }
      return { data: output, error: null };
    }

    return { data: null, error: new Error('Unknown query action') };
  }
}

const authListeners = new Set();
const mockAuth = {
  getSession: async () => {
    const sessionStr = localStorage.getItem('kos_mock_session');
    let session = null;
    if (sessionStr) {
      try { session = JSON.parse(sessionStr); } catch (e) {}
    } else {
      session = { user: { id: 'mock-admin', email: 'admin@cendana.kos' } };
      localStorage.setItem('kos_mock_session', JSON.stringify(session));
    }
    return { data: { session }, error: null };
  },
  signInWithPassword: async ({ email, password }) => {
    if (!email || !password) {
      return { data: { session: null }, error: { message: 'Email and password are required' } };
    }
    const session = { user: { id: 'mock-admin', email } };
    localStorage.setItem('kos_mock_session', JSON.stringify(session));
    authListeners.forEach(listener => listener('SIGNED_IN', session));
    return { data: { session }, error: null };
  },
  signOut: async () => {
    localStorage.removeItem('kos_mock_session');
    authListeners.forEach(listener => listener('SIGNED_OUT', null));
    return { error: null };
  },
  onAuthStateChange: (callback) => {
    authListeners.add(callback);
    const sessionStr = localStorage.getItem('kos_mock_session');
    let session = null;
    if (sessionStr) {
      try { session = JSON.parse(sessionStr); } catch (e) {}
    } else {
      session = { user: { id: 'mock-admin', email: 'admin@cendana.kos' } };
      localStorage.setItem('kos_mock_session', JSON.stringify(session));
    }
    callback('INITIAL_SESSION', session);
    return {
      data: {
        subscription: {
          unsubscribe: () => {
            authListeners.delete(callback);
          }
        }
      }
    };
  }
};

let supabaseInstance;

if (supabaseUrl && supabaseAnonKey && supabaseUrl !== 'placeholder_url' && supabaseAnonKey !== 'placeholder_key') {
  try {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  } catch (err) {
    console.warn('Failed to initialize Supabase real client, using mock fallback instead:', err);
    supabaseInstance = {
      auth: mockAuth,
      from: (table) => new SupabaseQueryBuilder(table)
    };
  }
} else {
  console.warn('Supabase credentials not configured. Using local-storage stateful mock client.');
  supabaseInstance = {
    auth: mockAuth,
    from: (table) => new SupabaseQueryBuilder(table)
  };
}

export const supabase = supabaseInstance;
