'use client';

import { Delete, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import type { ClipboardEvent, FocusEvent, KeyboardEvent } from 'react';

const digitRows = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
] as const;

type AmountKeypadQuickValue = {
  label: string;
  value: string;
};

type AmountKeypadProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  label: string;
  hint?: string;
  currency: string;
  quickValues?: AmountKeypadQuickValue[];
  maxValue?: number;
  disabled?: boolean;
  expandOnFocus?: boolean;
  error?: string;
};

function normalizeAmount(value: string) {
  const cleaned = value.replace(/[$,\s]/g, '').replace(/[^\d.]/g, '');
  if (!cleaned) return '';

  const [wholePart = '', ...fractionParts] = cleaned.split('.');
  const whole = wholePart.replace(/^0+(?=\d)/, '') || '0';
  const fraction = fractionParts.join('').slice(0, 2);
  return fractionParts.length ? `${whole}.${fraction}` : whole;
}

function currencySymbol(currency: string) {
  try {
    return (
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        currencyDisplay: 'narrowSymbol',
      })
        .formatToParts(0)
        .find((part) => part.type === 'currency')?.value ?? currency
    );
  } catch {
    return currency;
  }
}

function displayAmount(value: string) {
  if (!value) return '0.00';
  const [whole = '0', fraction] = value.split('.');
  const formattedWhole = Number(whole || 0).toLocaleString('en-US');
  return fraction === undefined ? formattedWhole : `${formattedWhole}.${fraction}`;
}

export function AmountKeypad({
  id,
  value,
  onChange,
  label,
  hint,
  currency,
  quickValues = [],
  maxValue,
  disabled = false,
  expandOnFocus = false,
  error,
}: AmountKeypadProps) {
  const [isExpanded, setIsExpanded] = useState(!expandOnFocus);
  const updateValue = (nextValue: string) => {
    const normalized = normalizeAmount(nextValue);
    if (normalized && maxValue !== undefined && Number(normalized) > maxValue) return;
    onChange(normalized);
  };
  const symbol = currencySymbol(currency);
  const displayLabel = value ? `${symbol}${displayAmount(value)}` : `${symbol}0.00`;
  const showKeypad = !expandOnFocus || isExpanded;

  function appendValue(nextCharacter: string) {
    if (nextCharacter === '.' && value.includes('.')) return;
    if (value === '0' && nextCharacter !== '.') {
      updateValue(nextCharacter);
      return;
    }
    updateValue(`${value}${nextCharacter}`);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    if (/^\d$/.test(event.key) || event.key === '.') {
      event.preventDefault();
      appendValue(event.key);
      return;
    }
    if (event.key === 'Backspace') {
      event.preventDefault();
      updateValue(value.slice(0, -1));
      return;
    }
    if (event.key === 'Delete') {
      event.preventDefault();
      updateValue('');
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    if (disabled) return;
    const pastedValue = normalizeAmount(event.clipboardData.getData('text'));
    if (!pastedValue) return;
    updateValue(pastedValue);
  }

  function handleFocus() {
    if (expandOnFocus) setIsExpanded(true);
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!expandOnFocus) return;
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    setIsExpanded(false);
  }

  return (
    <div
      className="amount-keypad"
      role="group"
      aria-label={`${label} keypad`}
      aria-describedby={error && id ? id + '-error' : undefined}
      aria-disabled={disabled}
      data-expanded={showKeypad}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
    >
      <div className="amount-keypad-heading">
        <div>
          <span className="amount-keypad-label">{label}</span>
          {hint ? <span className="amount-keypad-hint">{hint}</span> : null}
        </div>
        <span className="amount-keypad-currency">{currency}</span>
      </div>
      {error && id ? (
        <p className="amount-keypad-error" id={id + '-error'} role="alert">
          {error}
        </p>
      ) : null}

      <button
        id={id}
        type="button"
        className="amount-keypad-display"
        data-dialog-focus={!disabled ? true : undefined}
        aria-expanded={expandOnFocus ? showKeypad : undefined}
        aria-label={`${label}: ${displayLabel}. ${showKeypad ? 'Number keypad open' : 'Open number keypad'}`}
        aria-live="polite"
        onClick={() => setIsExpanded(true)}
        disabled={disabled}
      >
        <span className="amount-keypad-symbol" aria-hidden="true">
          {symbol}
        </span>
        <strong className={value ? undefined : 'is-placeholder'} aria-hidden="true">
          {displayAmount(value)}
        </strong>
      </button>

      {showKeypad ? (
        <>
          {quickValues.length ? (
            <div className="amount-keypad-quick" role="group" aria-label={`${label} shortcuts`}>
              {quickValues.map((quickValue) => (
                <button
                  className={`amount-keypad-quick-button${value === quickValue.value ? ' active' : ''}`}
                  type="button"
                  key={`${quickValue.label}-${quickValue.value}`}
                  onClick={() => updateValue(quickValue.value)}
                  disabled={disabled}
                >
                  {quickValue.label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="amount-keypad-grid" aria-label={`${label} keypad buttons`}>
            {digitRows.flat().map((digit) => (
              <button
                className="amount-keypad-key"
                type="button"
                key={digit}
                onClick={() => appendValue(digit)}
                disabled={disabled}
                aria-label={`Enter ${digit}`}
              >
                {digit}
              </button>
            ))}
            <button
              className="amount-keypad-key amount-keypad-key-secondary"
              type="button"
              onClick={() => appendValue('.')}
              disabled={disabled || value.includes('.')}
              aria-label="Enter decimal point"
            >
              .
            </button>
            <button
              className="amount-keypad-key"
              type="button"
              onClick={() => appendValue('0')}
              disabled={disabled}
              aria-label="Enter 0"
            >
              0
            </button>
            <button
              className="amount-keypad-key amount-keypad-key-secondary"
              type="button"
              onClick={() => updateValue(value.slice(0, -1))}
              disabled={disabled || !value}
              aria-label="Delete last character"
            >
              <Delete size={20} aria-hidden="true" />
              <span>Delete</span>
            </button>
          </div>

          <div className="amount-keypad-actions">
            <button
              className="amount-keypad-clear"
              type="button"
              onClick={() => updateValue('')}
              disabled={disabled || !value}
            >
              <RotateCcw size={16} aria-hidden="true" />
              <span>Clear</span>
            </button>
            <span className="amount-keypad-footnote">
              Use number keys and Backspace on desktop.
            </span>
          </div>
        </>
      ) : (
        <span className="amount-keypad-expand-hint">Tap the amount to open the number keypad.</span>
      )}
    </div>
  );
}
