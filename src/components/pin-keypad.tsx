'use client';

import { Delete, RotateCcw } from 'lucide-react';
import type { ClipboardEvent, KeyboardEvent } from 'react';

const keypadRows = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
] as const;

type PinKeypadProps = {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  label: string;
  hint?: string;
  error?: string;
  maxLength?: number;
  disabled?: boolean;
  autoSubmit?: boolean;
};

function normalizePin(value: string, maxLength: number) {
  return value.replace(/\D/g, '').slice(0, maxLength);
}

export function PinKeypad({
  value,
  onChange,
  onComplete,
  label,
  hint,
  error,
  maxLength = 4,
  disabled = false,
  autoSubmit = false,
}: PinKeypadProps) {
  const updateValue = (nextValue: string) => {
    const normalizedValue = normalizePin(nextValue, maxLength);
    const reachedMaxLength = value.length < maxLength && normalizedValue.length === maxLength;
    onChange(normalizedValue);
    if (reachedMaxLength) onComplete?.(normalizedValue);
  };
  const keypadLabel = `${label} keypad`;
  const enteredLabel = `${value.length} of ${maxLength} digits entered`;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      updateValue(`${value}${event.key}`);
      return;
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      updateValue(value.slice(0, -1));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.closest('form')?.requestSubmit();
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    if (disabled) return;
    const pastedValue = normalizePin(event.clipboardData.getData('text'), maxLength);
    if (!pastedValue) return;
    event.preventDefault();
    updateValue(pastedValue);
  }

  return (
    <div
      className={`pin-keypad${error ? ' has-error' : ''}`}
      data-dialog-focus={!disabled ? true : undefined}
      role="group"
      aria-label={keypadLabel}
      aria-describedby={error ? 'pin-keypad-error' : undefined}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
    >
      <div className="pin-keypad-heading">
        <div>
          <span className="pin-keypad-label">{label}</span>
          {hint ? <span className="pin-keypad-hint">{hint}</span> : null}
        </div>
        <span className="pin-keypad-count" aria-live="polite">
          {enteredLabel}
        </span>
      </div>

      <div className="pin-keypad-digits" aria-label={enteredLabel} aria-live="polite">
        {Array.from({ length: maxLength }, (_, index) => (
          <span
            className={`pin-keypad-digit${index < value.length ? ' is-filled' : ''}`}
            key={index}
            aria-hidden="true"
          >
            {index < value.length ? '•' : ''}
          </span>
        ))}
      </div>

      {error ? (
        <span className="pin-keypad-error" id="pin-keypad-error" role="alert">
          {error}
        </span>
      ) : null}

      <div className="pin-keypad-grid" aria-label="PIN keypad buttons">
        {keypadRows.flat().map((digit) => (
          <button
            className="pin-keypad-key"
            type="button"
            key={digit}
            onClick={() => updateValue(`${value}${digit}`)}
            disabled={disabled || value.length >= maxLength}
            aria-label={`Enter ${digit}`}
          >
            {digit}
          </button>
        ))}
        <button
          className="pin-keypad-key pin-keypad-key-secondary"
          type="button"
          onClick={() => updateValue('')}
          disabled={disabled || !value}
          aria-label="Clear PIN"
        >
          <RotateCcw size={18} aria-hidden="true" />
          <span>Clear</span>
        </button>
        <button
          className="pin-keypad-key"
          type="button"
          onClick={() => updateValue(`${value}0`)}
          disabled={disabled || value.length >= maxLength}
          aria-label="Enter 0"
        >
          0
        </button>
        <button
          className="pin-keypad-key pin-keypad-key-secondary"
          type="button"
          onClick={() => updateValue(value.slice(0, -1))}
          disabled={disabled || !value}
          aria-label="Delete last digit"
        >
          <Delete size={20} aria-hidden="true" />
          <span>Delete</span>
        </button>
      </div>

      <span className="pin-keypad-footnote">
        {autoSubmit ? `Enter all ${maxLength} digits to confirm automatically. ` : ''}Use the number
        keys and Backspace on desktop.
      </span>
    </div>
  );
}
