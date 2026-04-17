import { useState, useEffect } from 'react';
import { receptionAPI } from '../../api/services';
import Modal from '../../components/shared/Modal';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { getErrorMessage, getStatusBadge, formatDate } from '../../utils/helpers';
import { Search, Printer, Download, IndianRupee, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

export default function BillingList() {
  const [billings,  setBillings]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [dateFilter,setDateFilter]= useState('');
  const [payModal,  setPayModal]  = useState({ open: false, billing: null });
  const [paying,    setPaying]    = useState(false);
  const [pdfLoading,setPdfLoading]= useState({});  // { [billingId]: 'print'|'download'|null }

  const fetchBillings = async (params = {}) => {
    setLoading(true);
    try {
      const { data } = await receptionAPI.getBillings(params);
      setBillings(data.data || data);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBillings(); }, []);

  const handleSearch = (e) => {
    const q = e.target.value;
    setSearch(q);
    fetchBillings({ search: q, date: dateFilter });
  };

  const handleDateFilter = (e) => {
    const d = e.target.value;
    setDateFilter(d);
    fetchBillings({ search, date: d });
  };

  const clearFilters = () => {
    setSearch('');
    setDateFilter('');
    fetchBillings();
  };

  // ── Pay billing ──────────────────────────────────────────────────
  const handlePay = async (e) => {
    e.preventDefault();
    setPaying(true);
    try {
      await receptionAPI.payBilling(payModal.billing.id, {
        paid_amount: payModal.billing.total_amount,
      });
      toast.success('Payment recorded successfully.');
      setPayModal({ open: false, billing: null });
      fetchBillings({ search, date: dateFilter });
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPaying(false);
    }
  };

  // ── PDF helper — opens blob as object URL in new tab or downloads ──
  const handlePdf = async (billing, mode) => {
    setPdfLoading((prev) => ({ ...prev, [billing.id]: mode }));
    try {
      const response = mode === 'print'
        ? await receptionAPI.printBillPdf(billing.id)
        : await receptionAPI.downloadBillPdf(billing.id);

      const blob     = new Blob([response.data], { type: 'application/pdf' });
      const url      = window.URL.createObjectURL(blob);
      const filename = `bill_${billing.bill_no || billing.id}.pdf`;

      if (mode === 'print') {
        // Open in new tab — browser renders PDF inline, user can Ctrl+P
        const tab = window.open(url, '_blank');
        if (!tab) {
          toast.error('Pop-up blocked. Please allow pop-ups for this site.');
        }
      } else {
        // Trigger download
        const a    = document.createElement('a');
        a.href     = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast.success(`Bill downloaded as ${filename}`);
      }

      // Revoke the object URL after a short delay
      setTimeout(() => window.URL.revokeObjectURL(url), 10000);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPdfLoading((prev) => ({ ...prev, [billing.id]: null }));
    }
  };

  const isPdfLoading = (id, mode) => pdfLoading[id] === mode;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
          <p className="text-sm text-gray-500 mt-1">{billings.length} billing records</p>
        </div>
        <button onClick={clearFilters} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw size={14} /> Reset filters
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input-field pl-8"
            placeholder="Search by patient, appointment code, or bill no..."
            value={search}
            onChange={handleSearch}
          />
        </div>
        <div>
          <input
            type="date"
            className="input-field"
            value={dateFilter}
            onChange={handleDateFilter}
            title="Filter by date"
          />
        </div>
      </div>

      {/* Table */}
      {loading ? <LoadingSpinner /> : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  {['Bill No', 'Appointment', 'Patient', 'Date', 'Total', 'Paid', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="table-header">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {billings.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-gray-400 text-sm">
                      No billing records found.
                    </td>
                  </tr>
                ) : billings.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50 transition-colors">

                    {/* Bill No */}
                    <td className="table-cell">
                      <span className="font-mono text-xs text-blue-600 font-medium">
                        {b.bill_no || '—'}
                      </span>
                    </td>

                    {/* Appointment */}
                    <td className="table-cell">
                      <span className="font-mono text-xs text-gray-600">
                        {b.appointment?.appointment_code || `#${b.appointment}`}
                      </span>
                    </td>

                    {/* Patient */}
                    <td className="table-cell">
                      <p className="font-medium text-sm">
                        {b.patient?.full_name || `Patient #${b.patient}`}
                      </p>
                      <p className="text-xs text-gray-400">
                        {b.patient?.patient_code || ''}
                      </p>
                    </td>

                    {/* Date */}
                    <td className="table-cell text-sm text-gray-600">
                      {formatDate(b.created_at)}
                    </td>

                    {/* Total */}
                    <td className="table-cell font-medium">
                      Rs{Number(b.total_amount).toLocaleString('en-IN')}
                    </td>

                    {/* Paid */}
                    <td className="table-cell text-sm">
                      Rs{Number(b.paid_amount).toLocaleString('en-IN')}
                    </td>

                    {/* Status */}
                    <td className="table-cell">
                      <span className={getStatusBadge(b.payment_status)}>
                        {b.payment_status}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="table-cell">
                      <div className="flex items-center gap-1.5">

                        {/* Collect payment */}
                        {b.payment_status === 'PENDING' && (
                          <button
                            onClick={() => setPayModal({ open: true, billing: b })}
                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors"
                            style={{
                              background: 'var(--color-background-success)',
                              color: 'var(--color-text-success)',
                              border: '0.5px solid var(--color-border-success)',
                            }}
                            title="Collect payment"
                          >
                            <IndianRupee size={11} />
                            Pay
                          </button>
                        )}

                        {/* Print bill */}
                        <button
                          onClick={() => handlePdf(b, 'print')}
                          disabled={!!isPdfLoading(b.id, 'print')}
                          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors"
                          style={{
                            background: 'var(--color-background-info)',
                            color: 'var(--color-text-info)',
                            border: '0.5px solid var(--color-border-info)',
                            opacity: isPdfLoading(b.id, 'print') ? 0.6 : 1,
                          }}
                          title="Open bill for printing"
                        >
                          {isPdfLoading(b.id, 'print')
                            ? <div className="w-3 h-3 animate-spin rounded-full border border-blue-300 border-t-blue-600" />
                            : <Printer size={11} />
                          }
                          Print
                        </button>

                        {/* Download bill */}
                        <button
                          onClick={() => handlePdf(b, 'download')}
                          disabled={!!isPdfLoading(b.id, 'download')}
                          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors"
                          style={{
                            background: 'var(--color-background-secondary)',
                            color: 'var(--color-text-secondary)',
                            border: '0.5px solid var(--color-border-secondary)',
                            opacity: isPdfLoading(b.id, 'download') ? 0.6 : 1,
                          }}
                          title="Download bill as PDF"
                        >
                          {isPdfLoading(b.id, 'download')
                            ? <div className="w-3 h-3 animate-spin rounded-full border border-gray-300 border-t-gray-600" />
                            : <Download size={11} />
                          }
                          Save
                        </button>

                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Pay Modal ── */}
      <Modal
        isOpen={payModal.open}
        onClose={() => setPayModal({ open: false, billing: null })}
        title="Collect Payment"
      >
        {payModal.billing && (
          <form onSubmit={handlePay} className="space-y-4">
            {/* Summary */}
            <div className="rounded-lg p-4 space-y-2.5"
              style={{ background: 'var(--color-background-secondary)' }}>

              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Bill No</span>
                <span className="font-mono font-medium text-blue-600">
                  {payModal.billing.bill_no || '—'}
                </span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Appointment</span>
                <span className="font-mono text-gray-700 text-xs">
                  {payModal.billing.appointment?.appointment_code}
                </span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Patient</span>
                <span className="font-medium">
                  {payModal.billing.patient?.full_name}
                </span>
              </div>

              <div className="border-t border-gray-200 pt-2 flex justify-between items-center">
                <span className="text-gray-500 text-sm">Amount Due</span>
                <span className="text-2xl font-bold text-green-700">
                  Rs{Number(payModal.billing.total_amount).toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            <p className="text-sm text-gray-500">
              Clicking confirm will record the full payment of{' '}
              <strong>Rs{Number(payModal.billing.total_amount).toLocaleString('en-IN')}</strong>{' '}
              and mark this bill as paid.
            </p>

            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setPayModal({ open: false, billing: null })}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={paying}
                className="btn-success flex items-center gap-2"
              >
                {paying ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <IndianRupee size={14} />
                )}
                {paying ? 'Processing...' : 'Confirm Payment'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}