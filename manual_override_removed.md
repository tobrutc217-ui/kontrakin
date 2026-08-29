# manual_override dihapus dari logika

Error:
`Could not find the 'manual_override' column of 'invoices' in the schema cache`

Penyebabnya adalah UI/API meminta kolom yang memang tidak ada pada schema.

Solusi yang dipakai patch ini:
- Jangan menambah `manual_override` hanya untuk menutupi error.
- Nominal invoice berasal dari tarif kamar + periode.
- Perubahan tanggal hanya dicatat di `prorata_adjustments`.
- Pembayaran sebagian dihitung dari allocation pembayaran yang sebenarnya.
