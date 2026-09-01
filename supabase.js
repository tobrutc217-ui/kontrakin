import { createClient } from '@supabase/supabase-js';

const supabaseUrl = typeof import.meta.env !== 'undefined' ? import.meta.env.VITE_SUPABASE_URL : undefined;
const supabaseAnonKey = typeof import.meta.env !== 'undefined' ? import.meta.env.VITE_SUPABASE_ANON_KEY : undefined;

const getTable = (name) => {
  const data = localStorage.getItem(`kos_db_${name}`);
  if (data) {
    try { return JSON.parse(data); } catch (e) { return []; }
  }
  
  if (name === 'properties') {
    return [{ id: 'prop-1', name: 'Kos Cendana', address: 'Jl. Cendana No. 12, Jakarta', payment_name: 'Ryan Putra Pratama', payment_bca: '0571288191', payment_dana: '08816585970', payment_gopay: '085161174317', created_at: new Date().toISOString() }];
  }
  if (name === 'rooms') {
    return [
      { id: 'room-1', property_id: 'prop-1', room_number: '101', monthly_rate: 1500000, status: 'occupied', created_at: new Date().toISOString() },
      { id: 'room-2', property_id: 'prop-1', room_number: '102', monthly_rate: 1500000, status: 'vacant', created_at: new Date().toISOString() },
      { id: 'room-3', property_id: 'prop-1', room_number: '103', monthly_rate: 1800000, status: 'occupied', created_at: new Date().toISOString() }
    ];
  }
  if (name === 'tenants') {
    return [
      { id: 'tenant-1', room_id: 'room-1', full_name: 'Budi Santoso', email: 'budi@gmail.com', whatsapp_number: '6281234567890', id_card_number: '3171234567890001', lease_start: '2026-01-10', lease_end: '', billing_day: 10, created_at: new Date().toISOString() },
      { id: 'tenant-2', room_id: 'room-3', full_name: 'Siti Aminah', email: 'siti@gmail.com', whatsapp_number: '6289876543210', id_card_number: '3171234567890002', lease_start: '2026-03-15', lease_end: '', billing_day: 15, created_at: new Date().toISOString() }
    ];
  }
  if (name === 'invoices') return [];
  if (name === 'transactions') return [];
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

  select() { return this; }
  
  order(field, options = {}) {
    this.orderByField = field;
    this.orderAscending = options.ascending !== false;
    return this;
  }
  
  limit(count) { this.limitCount = count; return this; }
  eq(field, value) { this.filters.push(item => item[field] === value); return this; }
  lt(field, value) { this.filters.push(item => String(item[field]) < String(value)); return this; }
  in(field, values) { const set = new Set(values); this.filters.push(item => set.has(item[field])); return this; }
  single() { this._single = true; return this; }
  insert(payload) { this.action = 'insert'; this.payload = payload; return this; }
  update(payload) { this.action = 'update'; this.payload = payload; return this; }
  delete() { this.action = 'delete'; return this; }
  upsert(payload, options = {}) { this.action = 'upsert'; this.payload = payload; this.upsertOptions = options; return this; }
  then(onfulfilled, onrejected) { return this.execute().then(onfulfilled, onrejected); }
  
  async execute() {
    let result = [...this.data];
    
    if (this.action === 'select') {
      for (const filter of this.filters) result = result.filter(filter);
      if (this.orderByField) {
        result.sort((a, b) => {
          const valA = a[this.orderByField];
          const valB = b[this.orderByField];
          if (valA == null) return 1;
          if (valB == null) return -1;
          if (typeof valA === 'string') return this.orderAscending ? valA.localeCompare(valB) : valB.localeCompare(valA);
          return this.orderAscending ? valA - valB : valB - valA;
        });
      }
      if (this.limitCount !== null) result = result.slice(0, this.limitCount);
      if (this._single) return { data: result[0] || null, error: null };
      return { data: result, error: null };
    }
    
    if (this.action === 'insert') {
      const items = Array.isArray(this.payload) ? this.payload : [this.payload];
      const created = items.map(item => ({
        id: item.id || `${this.table}-${Math.random().toString(36).substr(2, 9)}`,
        created_at: new Date().toISOString(),
        paid_amount: item.paid_amount || 0,
        status: item.status || 'unpaid',
        ...item
      }));
      this.data.push(...created);
      setTable(this.table, this.data);
      return { data: Array.isArray(this.payload) ? created : created[0], error: null };
    }
    
    if (this.action === 'update') {
      let matched = [...this.data];
      for (const filter of this.filters) matched = matched.filter(filter);
      const matchedIds = new Set(matched.map(m => m.id));
      this.data = this.data.map(item => matchedIds.has(item.id) ? { ...item, ...this.payload } : item);
      setTable(this.table, this.data);
      return { data: matched.map(m => ({ ...m, ...this.payload })), error: null };
    }
    
    if (this.action === 'delete') {
      let matched = [...this.data];
      for (const filter of this.filters) matched = matched.filter(filter);
      const matchedIds = new Set(matched.map(m => m.id));
      this.data = this.data.filter(item => !matchedIds.has(item.id));
      setTable(this.table, this.data);
      return { data: matched, error: null };
    }
    
    // 🔥 FIXED UPSERT: Tidak menimpa paid_amount dan status pembayaran
    if (this.action === 'upsert') {
      const items = Array.isArray(this.payload) ? this.payload : [this.payload];
      const onConflict = this.upsertOptions.onConflict ? this.upsertOptions.onConflict.split(',').map(s => s.trim()) : [];
      const ignoreDuplicates = this.upsertOptions.ignoreDuplicates === true;
      const output = [];
      
      for (const item of items) {
        let matchIdx = -1;
        if (onConflict.length > 0) {
          matchIdx = this.data.findIndex(existing => onConflict.every(field => String(existing[field]) === String(item[field])));
        } else if (item.id) {
          matchIdx = this.data.findIndex(existing => existing.id === item.id);
        }
        
        if (matchIdx !== -1) {
          if (!ignoreDuplicates) {
            const existing = this.data[matchIdx];
            const updated = { ...existing };
            for (const key of Object.keys(item)) updated[key] = item[key];
            // ⚠️ PENTING: Jangan timpa paid_amount kalau item tidak specify
            if (item.paid_amount === undefined) updated.paid_amount = existing.paid_amount;
            if (item.status === undefined) updated.status = existing.status;
            this.data[matchIdx] = updated;
            output.push(this.data[matchIdx]);
          } else {
            output.push(this.data[matchIdx]);
          }
        } else {
          const newItem = {
            id: item.id || `${this.table}-${Math.random().toString(36).substr(2, 9)}`,
            created_at: new Date().toISOString(),
            paid_amount: item.paid_amount || 0,
            status: item.status || 'unpaid',
            ...item
          };
          this.data.push(newItem);
          output.push(newItem);
        }
      }
      setTable(this.table, this.data);
      return { data: Array.isArray(this.payload) ? output : output[0], error: null };
    }
    
    return { data: null, error: new Error('Unknown action') };
  }
}

const authListeners = new Set();
const mockAuth = {
  getSession: async () => {
    let session = null;
    const sessionStr = localStorage.getItem('kos_mock_session');
    if (sessionStr) { try { session = JSON.parse(sessionStr); } catch (e) {} }
    else {
      session = { user: { id: 'mock-admin', email: 'admin@cendana.kos' } };
      localStorage.setItem('kos_mock_session', JSON.stringify(session));
    }
    return { data: { session }, error: null };
  },
  signInWithPassword: async ({ email, password }) => {
    if (!email || !password) return { data: { session: null }, error: { message: 'Email and password required' } };
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
    let session = null;
    const sessionStr = localStorage.getItem('kos_mock_session');
    if (sessionStr) { try { session = JSON.parse(sessionStr); } catch (e) {} }
    else {
      session = { user: { id: 'mock-admin', email: 'admin@cendana.kos' } };
      localStorage.setItem('kos_mock_session', JSON.stringify(session));
    }
    callback('INITIAL_SESSION', session);
    return { data: { subscription: { unsubscribe: () => authListeners.delete(callback) } } };
  }
};

let supabaseInstance;
if (supabaseUrl && supabaseAnonKey && supabaseUrl !== 'placeholder_url' && supabaseAnonKey !== 'placeholder_key') {
  try { supabaseInstance = createClient(supabaseUrl, supabaseAnonKey); }
  catch (err) {
    console.warn('Supabase init failed, using mock:', err);
    supabaseInstance = { auth: mockAuth, from: (table) => new SupabaseQueryBuilder(table) };
  }
} else {
  supabaseInstance = { auth: mockAuth, from: (table) => new SupabaseQueryBuilder(table) };
}

export const supabase = supabaseInstance;
