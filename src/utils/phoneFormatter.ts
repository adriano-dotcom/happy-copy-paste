/**
 * Format phone number to international Brazilian format: +55 43 99909-2627
 * Accepts any input format and normalizes to standard international format
 */
export const formatPhoneInternational = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  
  // Already has country code (55) - 13 digits (mobile) or 12 (landline)
  if (digits.startsWith('55') && digits.length >= 12) {
    const ddd = digits.slice(2, 4);
    const number = digits.slice(4);
    if (number.length === 9) {
      return `+55 ${ddd} ${number.slice(0, 5)}-${number.slice(5)}`;
    }
    if (number.length === 8) {
      return `+55 ${ddd} ${number.slice(0, 4)}-${number.slice(4)}`;
    }
    // Truncate if too long
    if (number.length > 9) {
      return `+55 ${ddd} ${number.slice(0, 5)}-${number.slice(5, 9)}`;
    }
    return `+55 ${ddd} ${number}`;
  }
  
  // Without country code - 11 digits (mobile) or 10 (landline)
  if (digits.length >= 10) {
    const ddd = digits.slice(0, 2);
    const number = digits.slice(2);
    if (number.length === 9) {
      return `+55 ${ddd} ${number.slice(0, 5)}-${number.slice(5)}`;
    }
    if (number.length === 8) {
      return `+55 ${ddd} ${number.slice(0, 4)}-${number.slice(4)}`;
    }
    // Truncate if too long
    if (number.length > 9) {
      return `+55 ${ddd} ${number.slice(0, 5)}-${number.slice(5, 9)}`;
    }
    return `+55 ${ddd} ${number}`;
  }
  
  // Partial input - format progressively
  if (digits.length <= 2) {
    return digits.length > 0 ? `+55 ${digits}` : '';
  }
  if (digits.length <= 4) {
    return `+55 ${digits.slice(0, 2)} ${digits.slice(2)}`;
  }
  if (digits.length <= 9) {
    return `+55 ${digits.slice(0, 2)} ${digits.slice(2)}`;
  }
  
  return value;
};

/**
 * Display formatted phone for read-only display contexts
 * Returns formatted phone or original value if cannot format
 */
export const displayPhoneInternational = (phone: string | undefined | null): string => {
  if (!phone) return '-';
  const formatted = formatPhoneInternational(phone);
  return formatted || phone;
};
