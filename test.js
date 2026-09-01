// Mock a browser/Vite environment for testing supabase.js
global.localStorage = {
  store: {},
  getItem(key) {
    return this.store[key] || null;
  },
  setItem(key, value) {
    this.store[key] = String(value);
  },
  removeItem(key) {
    delete this.store[key];
  }
};

// Mock import.meta.env
global.import = {
  meta: {
    env: {
      VITE_SUPABASE_URL: 'placeholder_url',
      VITE_SUPABASE_ANON_KEY: 'placeholder_key'
    }
  }
};

import('./supabase.js').then(async ({ supabase }) => {
  console.log('Testing Supabase query builder...');
  
  // Test select
  const tenants = await supabase.from('tenants').select('*');
  console.log('Tenants:', tenants.data);

  // Test insert
  const newTx = { property_id: 'prop-1', category: 'Sewa Kamar', amount: 50000 };
  const txRes = await supabase.from('transactions').insert(newTx);
  console.log('Insert tx response:', txRes);

  // Test select after insert
  const txList = await supabase.from('transactions').select('*');
  console.log('Transactions list length:', txList.data.length);

  // Test update
  const updateRes = await supabase.from('transactions')
    .update({ amount: 100000 })
    .eq('id', txRes.data.id);
  console.log('Update tx response:', updateRes);

  // Test select after update
  const updatedTx = await supabase.from('transactions').select('*').eq('id', txRes.data.id).single();
  console.log('Single updated transaction:', updatedTx.data);

  // Test upsert
  const upsertRows = [
    { tenant_id: 'tenant-1', due_date: '2026-09-10', amount: 1500000 },
    { tenant_id: 'tenant-1', due_date: '2026-10-10', amount: 1500000 }
  ];
  const upsertRes = await supabase.from('invoices').upsert(upsertRows, {
    onConflict: 'tenant_id,due_date'
  });
  console.log('Upsert response:', upsertRes);

  // Test select after upsert
  const invoiceList = await supabase.from('invoices').select('*').eq('tenant_id', 'tenant-1');
  console.log('Tenant 1 invoices count:', invoiceList.data.length);

  console.log('All tests completed successfully!');
}).catch(err => {
  console.error('Test failed with error:', err);
});
