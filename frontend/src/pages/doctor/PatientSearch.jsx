import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { receptionAPI } from '../../api/services';
import { getErrorMessage, formatDate } from '../../utils/helpers';
import { Search, History, User } from 'lucide-react';
import toast from 'react-hot-toast';

export default function PatientSearch() {
  const [query,    setQuery]    = useState('');
  const [patients, setPatients] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [searched, setSearched] = useState(false);
  const navigate = useNavigate();

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const { data } = await receptionAPI.getPatients(query.trim());
      setPatients(data.data || data);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Patient Search</h1>
        <p className="text-sm text-gray-500 mt-1">
          Search by name or phone number to view a patient's consultation history.
        </p>
      </div>

      {/* Search form */}
      <form onSubmit={handleSearch} className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input-field pl-9"
            placeholder="Type patient name or phone number..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>
        <button type="submit" disabled={loading || !query.trim()} className="btn-primary px-5">
          {loading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : 'Search'}
        </button>
      </form>

      {/* Results */}
      {loading && (
        <div className="text-center py-8 text-gray-400 text-sm">Searching...</div>
      )}

      {!loading && searched && patients.length === 0 && (
        <div className="card text-center py-10">
          <User size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm font-medium">No patients found</p>
          <p className="text-gray-400 text-xs mt-1">Try a different name or phone number</p>
        </div>
      )}

      {!loading && patients.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">{patients.length} result{patients.length !== 1 ? 's' : ''} found</p>
          {patients.map((p) => (
            <div key={p.id} className="card hover:shadow-md transition-all">
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div style={{
                  width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
                  background: '#f0fdfa', color: '#0f766e',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 600, fontSize: 16,
                }}>
                  {p.full_name[0]}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900">{p.full_name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-gray-500 font-mono">{p.patient_code}</span>
                    <span className="text-xs text-gray-400">{p.phone}</span>
                    {p.dob && (
                      <span className="text-xs text-gray-400">DOB: {formatDate(p.dob)}</span>
                    )}
                  </div>
                  <div className="mt-1">
                    <span style={{
                      fontSize: 11, padding: '1px 7px', borderRadius: 999,
                      background: p.gender === 'M' ? '#eff6ff' : p.gender === 'F' ? '#fdf2f8' : '#f3f4f6',
                      color: p.gender === 'M' ? '#1e40af' : p.gender === 'F' ? '#9d174d' : '#4b5563',
                    }}>
                      {p.gender === 'M' ? 'Male' : p.gender === 'F' ? 'Female' : 'Other'}
                    </span>
                  </div>
                </div>

                {/* Action */}
                <button
                  onClick={() => navigate(`/doctor/history/${p.id}`)}
                  className="flex items-center gap-1.5 text-sm font-medium"
                  style={{
                    padding: '6px 14px', borderRadius: 8,
                    background: '#f0fdfa', color: '#0f766e',
                    border: '0.5px solid #99f6e4', cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <History size={14} />
                  View History
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}