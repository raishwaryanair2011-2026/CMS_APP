import api from './axios';

export const authAPI = {
  login:          (data)    => api.post('/api/v1/auth/login/', data),
  logout:         (data)    => api.post('/api/v1/auth/logout/', data),
  me:             ()        => api.get('/api/v1/auth/me/'),
  changePassword: (data)    => api.post('/api/v1/auth/change-password/', data),
};

export const adminAPI = {
  // Staff
  getStaff:         ()       => api.get('/api/v1/admin/staff/'),
  createStaff:      (data)   => api.post('/api/v1/admin/staff/', data),
  updateStaff:      (id, d)  => api.patch(`/api/v1/admin/staff/${id}/`, d),
  deleteStaff:      (id)     => api.delete(`/api/v1/admin/staff/${id}/`),
  activateStaff:    (id)     => api.post(`/api/v1/admin/staff/${id}/activate/`),
  deactivateStaff:  (id)     => api.post(`/api/v1/admin/staff/${id}/deactivate/`),
  assignRole:       (id, role) => api.post(`/api/v1/admin/staff/${id}/assign-role/`, { role }),

  // Specializations
  getSpecializations:    ()      => api.get('/api/v1/admin/specializations/'),
  createSpecialization:  (data)  => api.post('/api/v1/admin/specializations/', data),
  updateSpecialization:  (id, d) => api.patch(`/api/v1/admin/specializations/${id}/`, d),
  deleteSpecialization:  (id)    => api.delete(`/api/v1/admin/specializations/${id}/`),

  // Doctors
  getDoctors:      ()       => api.get('/api/v1/admin/doctors/'),
  getPublicDoctors: ()      => api.get('/api/v1/admin/doctors/public/'),
  updateDoctorImage:(id,fd)  => api.patch(`/api/v1/admin/doctors/${id}/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  createDoctor:    (data)   => api.post('/api/v1/admin/doctors/', data),
  updateDoctor:    (id, d)  => api.patch(`/api/v1/admin/doctors/${id}/`, d),
  deleteDoctor:    (id)     => api.delete(`/api/v1/admin/doctors/${id}/`),

  // Schedules
  getSchedules:    ()       => api.get('/api/v1/admin/schedules/'),
  createSchedule:  (data)   => api.post('/api/v1/admin/schedules/', data),
  updateSchedule:  (id, d)  => api.patch(`/api/v1/admin/schedules/${id}/`, d),
  deleteSchedule:  (id)     => api.delete(`/api/v1/admin/schedules/${id}/`),
};

export const receptionAPI = {
  // Patients
  getPatients:     (search) => api.get('/api/v1/reception/patients/', { params: { search } }),
  createPatient:   (data)   => api.post('/api/v1/reception/patients/', data),
  updatePatient:   (id, d)  => api.patch(`/api/v1/reception/patients/${id}/`, d),
  deletePatient:   (id)     => api.delete(`/api/v1/reception/patients/${id}/`),

  // Appointments
  bookAppointment:      (data) => api.post('/api/v1/reception/appointments/book/', data),
  getTodayAppointments: (sid)  => api.get('/api/v1/reception/appointments/today/', { params: { schedule: sid } }),
  getAppointment:       (id)   => api.get(`/api/v1/reception/appointments/${id}/`),
  cancelAppointment:    (id)   => api.patch(`/api/v1/reception/appointments/${id}/cancel/`),
  completeAppointment:  (id)   => api.patch(`/api/v1/reception/appointments/${id}/complete/`),
  getSlots: (scheduleId, date) => api.get(`/api/v1/reception/appointments/slots/?schedule=${scheduleId}&date=${date}`),

  // Schedules (for booking dropdown)
  getTodaySchedules: () => api.get('/api/v1/reception/schedules/today/'),

  // Billing
  getBillings:  (params) => api.get('/api/v1/reception/billing/', { params }),
  getBilling:   (id)     => api.get(`/api/v1/reception/billing/${id}/`),
  payBilling:      (id, d)  => api.patch(`/api/v1/reception/billing/${id}/pay/`, d),
  printBillPdf:    (id)     => api.get(`/api/v1/reception/billing/${id}/pdf/`,      { responseType: 'blob' }),
  downloadBillPdf: (id)     => api.get(`/api/v1/reception/billing/${id}/download/`, { responseType: 'blob' }),
};

export const doctorAPI = {
  // Dashboard stats
  getDashboard:        ()     => api.get('/api/v1/doctor/dashboard/'),

  // Patient history
  getPatientHistory:   (pid)  => api.get(`/api/v1/doctor/patients/${pid}/history/`),

  // Consultations
  getConsultations:    ()     => api.get('/api/v1/doctor/consultations/'),
  getConsultationsByPatient: (pid) => api.get(`/api/v1/doctor/consultations/?patient=${pid}`),
  getConsultation:     (id)   => api.get(`/api/v1/doctor/consultations/${id}/`),
  createConsultation:  (data) => api.post('/api/v1/doctor/consultations/', data),
  updateConsultation:  (id,d) => api.patch(`/api/v1/doctor/consultations/${id}/`, d),
  completeConsultation:(id)   => api.post(`/api/v1/doctor/consultations/${id}/complete/`),

  // Prescriptions
  getPrescription:     (cId)       => api.get(`/api/v1/doctor/consultations/${cId}/prescription/`),
  createPrescription:  (cId, data) => api.post(`/api/v1/doctor/consultations/${cId}/prescription/`, data),
  updatePrescription:  (cId,pId,d) => api.patch(`/api/v1/doctor/consultations/${cId}/prescription/${pId}/`, d),

  // Prescription PDF
  printPrescriptionPdf:    (cId) => api.get(`/api/v1/doctor/consultations/${cId}/rx-pdf/`,      { responseType: 'blob' }),
  downloadPrescriptionPdf: (cId) => api.get(`/api/v1/doctor/consultations/${cId}/rx-download/`, { responseType: 'blob' }),

  // Medicines in prescription
  addMedicine:    (cId,pId,d)   => api.post(`/api/v1/doctor/consultations/${cId}/prescription/${pId}/medicines/`, d),
  removeMedicine: (cId,pId,mId) => api.delete(`/api/v1/doctor/consultations/${cId}/prescription/${pId}/medicines/${mId}/`),
};

export const pharmacyAPI = {
  // Dashboard
  getDashboard: () => api.get('/api/v1/pharmacy/dashboard/'),

  // Categories
  getCategories:    ()      => api.get('/api/v1/pharmacy/categories/'),
  createCategory:   (data)  => api.post('/api/v1/pharmacy/categories/', data),

  // Medicines
  getMedicines:  (params) => api.get('/api/v1/pharmacy/medicines/', { params }),
  createMedicine:(data)   => api.post('/api/v1/pharmacy/medicines/', data),
  updateMedicine:(id, d)  => api.patch(`/api/v1/pharmacy/medicines/${id}/`, d),

  // Batches
  getBatches:    (params) => api.get('/api/v1/pharmacy/batches/', { params }),
  createBatch:   (data)   => api.post('/api/v1/pharmacy/batches/', data),

  // Prescriptions (pending queue)
  getPendingPrescriptions: () => api.get('/api/v1/pharmacy/prescriptions/pending/'),
  getAllPrescriptions:      () => api.get('/api/v1/pharmacy/prescriptions/'),

  // Dispense
  getDispenses:  ()      => api.get('/api/v1/pharmacy/dispense/'),
  dispense:      (data)  => api.post('/api/v1/pharmacy/dispense/', data),

  // Bill items
  getBillItems:  (billingId) => api.get('/api/v1/pharmacy/bill-items/', { params: { billing: billingId } }),
  createBillItem:(data)      => api.post('/api/v1/pharmacy/bill-items/', data),

  // Pharmacy bill PDF
  printPharmacyBillPdf:    (rxId) => api.get(`/api/v1/pharmacy/prescriptions/${rxId}/bill-pdf/`,      { responseType: 'blob' }),
  downloadPharmacyBillPdf: (rxId) => api.get(`/api/v1/pharmacy/prescriptions/${rxId}/bill-download/`, { responseType: 'blob' }),
};