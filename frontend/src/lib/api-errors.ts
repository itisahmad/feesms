/** Human-readable labels for API field keys */
const FIELD_LABELS: Record<string, string> = {
  phone: 'Phone',
  parent_phone: 'Parent phone',
  name: 'Name',
  email: 'Email',
  username: 'Username',
  password: 'Password',
  password2: 'Confirm password',
  school_class: 'Class',
  enquiry_date: 'Enquiry date',
  follow_up_date: 'Follow-up date',
  status: 'Status',
  source: 'Source',
  notes: 'Notes',
};

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Pull the first string message from nested DRF validation payloads.
 * Handles { phone: "..." }, { phone: ["..."] }, { phone: { phone: "..." } }, detail, error, etc.
 */
export function extractFirstApiMessage(data: unknown): string | null {
  if (data == null) return null;
  if (typeof data === 'string') return data.trim() || null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const msg = extractFirstApiMessage(item);
      if (msg) return msg;
    }
    return null;
  }
  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (typeof obj.detail === 'string' && obj.detail.trim()) return obj.detail;
    if (typeof obj.error === 'string' && obj.error.trim()) return obj.error;
    for (const [key, val] of Object.entries(obj)) {
      if (key === 'detail' || key === 'error') continue;
      const msg = extractFirstApiMessage(val);
      if (msg) {
        if (typeof val === 'string') return `${fieldLabel(key)}: ${msg}`;
        return msg;
      }
    }
  }
  return null;
}

/** All validation messages (for multi-field forms). */
export function extractApiMessages(data: unknown): string[] {
  const messages: string[] = [];

  const walk = (value: unknown, fieldKey?: string) => {
    if (value == null) return;
    if (typeof value === 'string') {
      const text = value.trim();
      if (!text) return;
      messages.push(fieldKey ? `${fieldLabel(fieldKey)}: ${text}` : text);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, fieldKey));
      return;
    }
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      if (typeof obj.detail === 'string' && obj.detail.trim()) {
        messages.push(obj.detail);
        return;
      }
      for (const [key, val] of Object.entries(obj)) {
        if (key === 'detail' || key === 'error') {
          if (typeof val === 'string' && val.trim()) messages.push(val);
          continue;
        }
        walk(val, key);
      }
    }
  };

  walk(data);
  return [...new Set(messages)];
}

export function formatApiError(data: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const messages = extractApiMessages(data);
  if (messages.length === 0) {
    return extractFirstApiMessage(data) || fallback;
  }
  return messages.join(' ');
}
