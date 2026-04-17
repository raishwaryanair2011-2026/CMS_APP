// Format date to DD/MM/YYYY
export const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
};

// Format currency in INR
export const formatCurrency = (amount) => {
  if (!amount && amount !== 0) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 2,
  }).format(amount);
};

// Format datetime
export const formatDateTime = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

// Extract a readable error message from any axios error shape.
// Handles all DRF response formats:
//   { detail: "..." }                        — permission / auth errors
//   { message: "..." }                       — custom message
//   { errors: { field: ["msg"] } }           — our custom envelope
//   { field: ["msg"], ... }                  — DRF default field errors (no wrapper)
//   { non_field_errors: ["msg"] }            — DRF non-field errors
//   { __all__: ["msg"] }                     — model-level validation errors
//   "plain string"                           — rare, but possible
export const getErrorMessage = (error) => {
  // Network error or no response at all
  if (!error?.response) {
    return error?.message || 'Network error. Please check your connection.';
  }

  const data = error.response.data;

  // No data in response
  if (!data) return `Error ${error.response.status}. Please try again.`;

  // Plain string response
  if (typeof data === 'string') return data;

  // { detail: "..." } — most common for permission/auth errors
  if (data.detail) return data.detail;

  // { message: "..." } — our custom error_response envelope
  if (data.message && !data.errors) return data.message;

  // Determine the errors object — either wrapped in data.errors or at top level
  const errObj = data.errors || data;

  if (typeof errObj === 'object' && !Array.isArray(errObj)) {
    const msgs = [];

    const extractVal = (key, val) => {
      // Skip success/message/data keys from our envelope
      if (['success', 'message', 'data'].includes(key)) return;

      if (Array.isArray(val)) {
        val.forEach((v) => {
          if (typeof v === 'string') {
            // Hide field prefix for non_field_errors and __all__
            const hide = key === 'non_field_errors' || key === '__all__';
            msgs.push(hide ? v : `${v}`);
          } else if (typeof v === 'object') {
            // Nested errors e.g. user: { username: ["taken"] }
            Object.entries(v).forEach(([k2, v2]) => {
              const m = Array.isArray(v2) ? v2[0] : v2;
              msgs.push(String(m));
            });
          }
        });
      } else if (typeof val === 'string') {
        const hide = key === 'non_field_errors' || key === '__all__';
        msgs.push(hide ? val : val);
      } else if (typeof val === 'object' && val !== null) {
        // Nested dict e.g. user: { username: ["taken"] }
        Object.entries(val).forEach(([k2, v2]) => {
          extractVal(k2, v2);
        });
      }
    };

    Object.entries(errObj).forEach(([key, val]) => extractVal(key, val));

    if (msgs.length > 0) return msgs[0]; // show first error as toast
  }

  // Fallback with HTTP status
  const status = error.response.status;
  if (status === 400) return 'Invalid data. Please check the form.';
  if (status === 401) return 'Session expired. Please log in again.';
  if (status === 403) return 'You do not have permission to perform this action.';
  if (status === 404) return 'The requested resource was not found.';
  if (status === 500) return 'Server error. Please try again or contact support.';
  return 'Something went wrong. Please try again.';
};

// Get badge color based on status
export const getStatusBadge = (status) => {
  const map = {
    BOOKED:      'badge-info',
    IN_PROGRESS: 'badge-warning',
    COMPLETED:   'badge-success',
    CANCELLED:   'badge-danger',
    PENDING:     'badge-warning',
    SUCCESS:     'badge-success',
  };
  return map[status] || 'badge-gray';
};

// Role to dashboard route map
export const getRoleDashboard = (role) => {
  const map = {
    Admin:        '/admin',
    Receptionist: '/reception',
    Doctor:       '/doctor',
    Pharmacist:   '/pharmacy',
  };
  return map[role] || '/';
};