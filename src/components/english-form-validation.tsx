'use client';

import { useEffect } from 'react';

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function isFormControl(target: EventTarget | null): target is FormControl {
  return target instanceof HTMLInputElement
    || target instanceof HTMLSelectElement
    || target instanceof HTMLTextAreaElement;
}

function validationMessage(control: FormControl) {
  const { validity } = control;

  if (validity.valueMissing) {
    if (control instanceof HTMLInputElement && control.type === 'checkbox') {
      return 'Please check this box to continue.';
    }
    if (control instanceof HTMLSelectElement) {
      return 'Please select an option.';
    }
    return 'Please fill out this field.';
  }

  if (validity.typeMismatch) {
    return control instanceof HTMLInputElement && control.type === 'email'
      ? 'Please enter a valid email address.'
      : 'Please enter a valid value.';
  }

  if (validity.badInput) {
    return control instanceof HTMLInputElement && control.type === 'number'
      ? 'Please enter a valid number.'
      : 'Please enter a valid value.';
  }

  if (validity.tooShort) {
    if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
      return `Please enter at least ${control.minLength} characters.`;
    }
  }

  if (validity.tooLong) {
    if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
      return `Please enter no more than ${control.maxLength} characters.`;
    }
  }

  if (validity.rangeUnderflow) {
    if (control instanceof HTMLInputElement) {
      return `Please enter a value of at least ${control.min}.`;
    }
  }

  if (validity.rangeOverflow) {
    if (control instanceof HTMLInputElement) {
      return `Please enter a value no greater than ${control.max}.`;
    }
  }

  if (validity.stepMismatch || validity.patternMismatch) {
    return 'Please enter a valid value.';
  }

  return 'Please enter a valid value.';
}

/**
 * Replaces browser-localized constraint-validation copy with app-owned English.
 * Native validation still prevents invalid submissions and keeps the existing
 * form rules intact; this only controls the message shown to the user.
 */
export default function EnglishFormValidation() {
  useEffect(() => {
    const handleInvalid = (event: Event) => {
      if (!isFormControl(event.target)) return;

      const control = event.target;
      if (control.validity.customError) return;
      control.setCustomValidity(validationMessage(control));
    };

    const clearMessage = (event: Event) => {
      if (!isFormControl(event.target)) return;
      event.target.setCustomValidity('');
    };

    document.addEventListener('invalid', handleInvalid, true);
    document.addEventListener('input', clearMessage, true);
    document.addEventListener('change', clearMessage, true);

    return () => {
      document.removeEventListener('invalid', handleInvalid, true);
      document.removeEventListener('input', clearMessage, true);
      document.removeEventListener('change', clearMessage, true);
    };
  }, []);

  return null;
}
