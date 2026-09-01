import React from 'react';
import { formatMoneyInput } from '../utils';

export function MoneyInput({ value, onChange, placeholder = '1,500,000', required = false, disabled = false }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={formatMoneyInput(value)}
      onChange={e => onChange(String(e.target.value).replace(/\D/g, ''))}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      className="money-input"
      autoComplete="off"
    />
  );
}
