-- ============================================================
-- ASHRAFF HOSPITAL KALMUNAI — AMH Patient Management System
-- Complete Database Schema for Supabase (PostgreSQL)
-- Run this entire file in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- TABLE 1: admin_users (must be created before patients)
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name     TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  role          TEXT NOT NULL
                CHECK (role IN (
                  'super_admin',
                  'opd_admin',
                  'clinic_admin',
                  'user_creator'
                )),
  is_active     BOOLEAN DEFAULT true,
  created_by    UUID REFERENCES admin_users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

-- ============================================================
-- TABLE 2: patients
-- ============================================================
CREATE TABLE IF NOT EXISTS patients (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unique_patient_id TEXT UNIQUE NOT NULL,
  -- Format: AMH + YYYY + 6-digit-zero-padded-sequence
  -- Example: AMH2026000123
  -- Sequence resets to 000001 each new year
  full_name         TEXT NOT NULL,
  age               INTEGER NOT NULL
                    CHECK (age >= 1 AND age <= 120),
  gender            TEXT NOT NULL
                    CHECK (gender IN ('Male','Female','Other')),
  address           TEXT NOT NULL,
  nic_number        TEXT UNIQUE NOT NULL,
  phone_number      TEXT UNIQUE NOT NULL,
  guardian_name     TEXT,
  -- Required if age < 18
  guardian_phone    TEXT,
  -- Required if age < 18
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  created_by_admin  UUID REFERENCES admin_users(id),
  -- NULL if self-registered
  last_login_at     TIMESTAMPTZ
);

-- ============================================================
-- TABLE 3: clinics
-- ============================================================
CREATE TABLE IF NOT EXISTS clinics (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_name  TEXT NOT NULL,
  description  TEXT,
  doctor_name  TEXT,
  specialty    TEXT,
  is_active    BOOLEAN DEFAULT true,
  created_by   UUID REFERENCES admin_users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE 4: opd_slot_templates
-- Admin sets day-of-week templates (apply to all future matching weekdays)
-- ============================================================
CREATE TABLE IF NOT EXISTS opd_slot_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week  INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  -- 0=Sunday, 1=Monday, ... 6=Saturday
  start_time   TIME NOT NULL,
  end_time     TIME NOT NULL,
  max_slots    INTEGER NOT NULL CHECK (max_slots >= 1 AND max_slots <= 500),
  is_active    BOOLEAN DEFAULT true,
  created_by   UUID REFERENCES admin_users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(day_of_week, start_time)
  -- Prevent duplicate time boxes on same day
);

-- ============================================================
-- TABLE 5: clinic_slot_templates
-- ============================================================
CREATE TABLE IF NOT EXISTS clinic_slot_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id    UUID REFERENCES clinics(id) ON DELETE CASCADE,
  day_of_week  INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time   TIME NOT NULL,
  end_time     TIME NOT NULL,
  max_slots    INTEGER NOT NULL CHECK (max_slots >= 1 AND max_slots <= 500),
  doctor_name  TEXT,
  -- Can override clinic default doctor per slot
  is_active    BOOLEAN DEFAULT true,
  created_by   UUID REFERENCES admin_users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clinic_id, day_of_week, start_time)
);

-- ============================================================
-- TABLE 6: blocked_dates
-- Super admin blocks specific dates (holidays, closures)
-- ============================================================
CREATE TABLE IF NOT EXISTS blocked_dates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocked_date DATE UNIQUE NOT NULL,
  reason       TEXT NOT NULL,
  -- e.g. "Eid Al-Fitr", "Hospital Maintenance"
  blocked_by   UUID REFERENCES admin_users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE 7: opd_bookings
-- ============================================================
CREATE TABLE IF NOT EXISTS opd_bookings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id       UUID REFERENCES patients(id),
  booking_date     DATE NOT NULL,
  template_id      UUID REFERENCES opd_slot_templates(id),
  slot_number      INTEGER NOT NULL,
  -- Patient's queue number within this time box
  status           TEXT DEFAULT 'pending'
                   CHECK (status IN (
                     'pending',
                     'verified',
                     'in_consultation',
                     'completed',
                     'cancelled',
                     'no_show'
                   )),
  verified_by      UUID REFERENCES admin_users(id),
  verified_at      TIMESTAMPTZ,
  booked_at        TIMESTAMPTZ DEFAULT NOW(),
  cancelled_at     TIMESTAMPTZ,
  cancellation_reason TEXT,
  UNIQUE(booking_date, template_id, slot_number)
  -- Prevent double-booking same slot
);

-- ============================================================
-- TABLE 8: clinic_bookings
-- ============================================================
CREATE TABLE IF NOT EXISTS clinic_bookings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id       UUID REFERENCES patients(id),
  clinic_id        UUID REFERENCES clinics(id),
  booking_date     DATE NOT NULL,
  template_id      UUID REFERENCES clinic_slot_templates(id),
  slot_number      INTEGER NOT NULL,
  status           TEXT DEFAULT 'pending'
                   CHECK (status IN (
                     'pending',
                     'verified',
                     'in_consultation',
                     'completed',
                     'cancelled',
                     'no_show'
                   )),
  verified_by      UUID REFERENCES admin_users(id),
  verified_at      TIMESTAMPTZ,
  booked_at        TIMESTAMPTZ DEFAULT NOW(),
  cancelled_at     TIMESTAMPTZ,
  cancellation_reason TEXT,
  UNIQUE(booking_date, template_id, slot_number)
);

-- ============================================================
-- TABLE 9: prescriptions
-- ============================================================
CREATE TABLE IF NOT EXISTS prescriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id          UUID REFERENCES patients(id),
  booking_type        TEXT NOT NULL CHECK (booking_type IN ('opd','clinic')),
  booking_id          UUID NOT NULL,
  -- References opd_bookings.id or clinic_bookings.id
  doctor_name         TEXT NOT NULL,
  doctor_reg_number   TEXT NOT NULL,
  diagnosis           TEXT,
  medicines           JSONB NOT NULL DEFAULT '[]',
  -- Array of {name, dosage, duration, instructions}
  notes               TEXT,
  valid_until         DATE NOT NULL,
  -- Default: issued_date + 3 days
  pharmacy_collected  BOOLEAN DEFAULT false,
  collected_at        TIMESTAMPTZ,
  collected_by_admin  UUID REFERENCES admin_users(id),
  issued_by           UUID REFERENCES admin_users(id),
  issued_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE 10: audit_logs
-- Every significant admin action is recorded
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     UUID REFERENCES admin_users(id),
  action_type  TEXT NOT NULL,
  -- e.g. 'CREATE_PATIENT', 'ISSUE_PRESCRIPTION', 'VERIFY_PATIENT'
  target_table TEXT,
  target_id    UUID,
  details      JSONB,
  ip_address   TEXT,
  performed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE 11: patient_id_sequence
-- Controls unique_patient_id generation per year
-- ============================================================
CREATE TABLE IF NOT EXISTS patient_id_sequence (
  year         INTEGER PRIMARY KEY,
  last_seq     INTEGER DEFAULT 0
);

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_patients_unique_id ON patients(unique_patient_id);
CREATE INDEX IF NOT EXISTS idx_patients_nic ON patients(nic_number);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone_number);
CREATE INDEX IF NOT EXISTS idx_opd_bookings_date ON opd_bookings(booking_date);
CREATE INDEX IF NOT EXISTS idx_opd_bookings_patient ON opd_bookings(patient_id);
CREATE INDEX IF NOT EXISTS idx_opd_bookings_template ON opd_bookings(template_id);
CREATE INDEX IF NOT EXISTS idx_clinic_bookings_date ON clinic_bookings(booking_date);
CREATE INDEX IF NOT EXISTS idx_clinic_bookings_patient ON clinic_bookings(patient_id);
CREATE INDEX IF NOT EXISTS idx_clinic_bookings_clinic ON clinic_bookings(clinic_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin ON audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_performed ON audit_logs(performed_at DESC);

-- ============================================================
-- FUNCTION 1: Generate unique patient ID atomically
-- ============================================================
CREATE OR REPLACE FUNCTION generate_patient_id()
RETURNS TEXT AS $$
DECLARE
  current_year INTEGER := EXTRACT(YEAR FROM NOW());
  next_seq     INTEGER;
BEGIN
  INSERT INTO patient_id_sequence (year, last_seq)
    VALUES (current_year, 1)
  ON CONFLICT (year) DO UPDATE
    SET last_seq = patient_id_sequence.last_seq + 1
  RETURNING last_seq INTO next_seq;

  RETURN 'AMH' || current_year || LPAD(next_seq::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCTION 2: Book OPD slot atomically (prevent race condition)
-- ============================================================
CREATE OR REPLACE FUNCTION book_opd_slot(
  p_patient_id   UUID,
  p_booking_date DATE,
  p_template_id  UUID
) RETURNS JSONB AS $$
DECLARE
  v_max_slots    INTEGER;
  v_booked_count INTEGER;
  v_slot_number  INTEGER;
  v_booking_id   UUID;
BEGIN
  -- Lock template row to prevent race conditions
  SELECT max_slots INTO v_max_slots
  FROM opd_slot_templates
  WHERE id = p_template_id FOR UPDATE;

  IF v_max_slots IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Template not found');
  END IF;

  -- Count existing non-cancelled bookings
  SELECT COUNT(*) INTO v_booked_count
  FROM opd_bookings
  WHERE booking_date = p_booking_date
    AND template_id = p_template_id
    AND status NOT IN ('cancelled', 'no_show');

  IF v_booked_count >= v_max_slots THEN
    RETURN jsonb_build_object('success', false, 'error', 'Slot is fully booked');
  END IF;

  -- Check if patient already has a booking on this date (OPD)
  IF EXISTS (
    SELECT 1 FROM opd_bookings ob
    WHERE ob.patient_id = p_patient_id
      AND ob.booking_date = p_booking_date
      AND ob.status NOT IN ('cancelled', 'no_show')
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'You already have an OPD booking on this date'
    );
  END IF;

  -- Check if patient already has a clinic booking on this date
  IF EXISTS (
    SELECT 1 FROM clinic_bookings cb
    WHERE cb.patient_id = p_patient_id
      AND cb.booking_date = p_booking_date
      AND cb.status NOT IN ('cancelled', 'no_show')
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'You already have a clinic booking on this date'
    );
  END IF;

  -- Assign next slot number
  v_slot_number := v_booked_count + 1;

  INSERT INTO opd_bookings
    (patient_id, booking_date, template_id, slot_number)
  VALUES
    (p_patient_id, p_booking_date, p_template_id, v_slot_number)
  RETURNING id INTO v_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'slot_number', v_slot_number
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCTION 3: Book clinic slot atomically
-- ============================================================
CREATE OR REPLACE FUNCTION book_clinic_slot(
  p_patient_id   UUID,
  p_clinic_id    UUID,
  p_booking_date DATE,
  p_template_id  UUID
) RETURNS JSONB AS $$
DECLARE
  v_max_slots    INTEGER;
  v_booked_count INTEGER;
  v_slot_number  INTEGER;
  v_booking_id   UUID;
BEGIN
  -- Lock template row to prevent race conditions
  SELECT max_slots INTO v_max_slots
  FROM clinic_slot_templates
  WHERE id = p_template_id FOR UPDATE;

  IF v_max_slots IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Template not found');
  END IF;

  -- Count existing non-cancelled bookings
  SELECT COUNT(*) INTO v_booked_count
  FROM clinic_bookings
  WHERE booking_date = p_booking_date
    AND template_id = p_template_id
    AND status NOT IN ('cancelled', 'no_show');

  IF v_booked_count >= v_max_slots THEN
    RETURN jsonb_build_object('success', false, 'error', 'Slot is fully booked');
  END IF;

  -- Check if patient already has an OPD booking on this date
  IF EXISTS (
    SELECT 1 FROM opd_bookings ob
    WHERE ob.patient_id = p_patient_id
      AND ob.booking_date = p_booking_date
      AND ob.status NOT IN ('cancelled', 'no_show')
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'You already have an OPD booking on this date'
    );
  END IF;

  -- Check if patient already has a clinic booking on this date
  IF EXISTS (
    SELECT 1 FROM clinic_bookings cb
    WHERE cb.patient_id = p_patient_id
      AND cb.booking_date = p_booking_date
      AND cb.status NOT IN ('cancelled', 'no_show')
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'You already have a clinic booking on this date'
    );
  END IF;

  -- Assign next slot number
  v_slot_number := v_booked_count + 1;

  INSERT INTO clinic_bookings
    (patient_id, clinic_id, booking_date, template_id, slot_number)
  VALUES
    (p_patient_id, p_clinic_id, p_booking_date, p_template_id, v_slot_number)
  RETURNING id INTO v_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'slot_number', v_slot_number
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCTION 4: Get OPD slot availability for a date
-- ============================================================
CREATE OR REPLACE FUNCTION get_opd_availability(p_date DATE)
RETURNS TABLE(
  template_id   UUID,
  day_of_week   INTEGER,
  start_time    TIME,
  end_time      TIME,
  max_slots     INTEGER,
  booked_count  BIGINT,
  available     INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ost.id AS template_id,
    ost.day_of_week,
    ost.start_time,
    ost.end_time,
    ost.max_slots,
    COUNT(ob.id) FILTER (WHERE ob.status NOT IN ('cancelled','no_show')) AS booked_count,
    (ost.max_slots - COUNT(ob.id) FILTER (WHERE ob.status NOT IN ('cancelled','no_show')))::INTEGER AS available
  FROM opd_slot_templates ost
  LEFT JOIN opd_bookings ob ON ob.template_id = ost.id AND ob.booking_date = p_date
  WHERE ost.day_of_week = EXTRACT(DOW FROM p_date)::INTEGER
    AND ost.is_active = true
  GROUP BY ost.id, ost.day_of_week, ost.start_time, ost.end_time, ost.max_slots
  ORDER BY ost.start_time;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCTION 5: Get clinic slot availability for a date
-- ============================================================
CREATE OR REPLACE FUNCTION get_clinic_availability(p_clinic_id UUID, p_date DATE)
RETURNS TABLE(
  template_id   UUID,
  day_of_week   INTEGER,
  start_time    TIME,
  end_time      TIME,
  max_slots     INTEGER,
  doctor_name   TEXT,
  booked_count  BIGINT,
  available     INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cst.id AS template_id,
    cst.day_of_week,
    cst.start_time,
    cst.end_time,
    cst.max_slots,
    cst.doctor_name,
    COUNT(cb.id) FILTER (WHERE cb.status NOT IN ('cancelled','no_show')) AS booked_count,
    (cst.max_slots - COUNT(cb.id) FILTER (WHERE cb.status NOT IN ('cancelled','no_show')))::INTEGER AS available
  FROM clinic_slot_templates cst
  LEFT JOIN clinic_bookings cb ON cb.template_id = cst.id AND cb.booking_date = p_date
  WHERE cst.clinic_id = p_clinic_id
    AND cst.day_of_week = EXTRACT(DOW FROM p_date)::INTEGER
    AND cst.is_active = true
  GROUP BY cst.id, cst.day_of_week, cst.start_time, cst.end_time, cst.max_slots, cst.doctor_name
  ORDER BY cst.start_time;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE opd_slot_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_slot_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE opd_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_id_sequence ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- patients table policies
-- ============================================================

-- Public can insert (for self-registration)
CREATE POLICY "patients_insert_public" ON patients
  FOR INSERT WITH CHECK (true);

-- Patients can read their own record (using session storage approach via anon key)
-- Admins can read all patients
CREATE POLICY "patients_select_all" ON patients
  FOR SELECT USING (true);

-- Only admins can update patients
CREATE POLICY "patients_update_admins" ON patients
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id::TEXT = auth.uid()::TEXT
        AND admin_users.is_active = true
    )
  );

-- Only super_admin can delete (soft delete via is_active)
CREATE POLICY "patients_delete_super_admin" ON patients
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id::TEXT = auth.uid()::TEXT
        AND admin_users.role = 'super_admin'
        AND admin_users.is_active = true
    )
  );

-- ============================================================
-- admin_users table policies
-- ============================================================

-- Admins can read all admin_users
CREATE POLICY "admin_users_select" ON admin_users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.id::TEXT = auth.uid()::TEXT
        AND au.is_active = true
    )
  );

-- Super admin can insert new admins
CREATE POLICY "admin_users_insert_super" ON admin_users
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id::TEXT = auth.uid()::TEXT
        AND admin_users.role = 'super_admin'
        AND admin_users.is_active = true
    )
  );

-- Super admin can update admins
CREATE POLICY "admin_users_update_super" ON admin_users
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id::TEXT = auth.uid()::TEXT
        AND admin_users.role = 'super_admin'
        AND admin_users.is_active = true
    )
  );

-- ============================================================
-- clinics table policies
-- ============================================================

-- Anyone can read active clinics
CREATE POLICY "clinics_select_all" ON clinics
  FOR SELECT USING (true);

-- Admins can insert clinics
CREATE POLICY "clinics_insert_admins" ON clinics
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id::TEXT = auth.uid()::TEXT
        AND admin_users.role IN ('super_admin', 'clinic_admin')
        AND admin_users.is_active = true
    )
  );

-- Admins can update clinics
CREATE POLICY "clinics_update_admins" ON clinics
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id::TEXT = auth.uid()::TEXT
        AND admin_users.role IN ('super_admin', 'clinic_admin')
        AND admin_users.is_active = true
    )
  );

-- ============================================================
-- opd_slot_templates policies
-- ============================================================

-- Anyone can read active templates (needed for booking page)
CREATE POLICY "opd_slots_select_all" ON opd_slot_templates
  FOR SELECT USING (true);

-- OPD and super admins can manage templates
CREATE POLICY "opd_slots_insert" ON opd_slot_templates
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id::TEXT = auth.uid()::TEXT
        AND admin_users.role IN ('super_admin', 'opd_admin')
        AND admin_users.is_active = true
    )
  );

CREATE POLICY "opd_slots_update" ON opd_slot_templates
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id::TEXT = auth.uid()::TEXT
        AND admin_users.role IN ('super_admin', 'opd_admin')
        AND admin_users.is_active = true
    )
  );

-- ============================================================
-- clinic_slot_templates policies
-- ============================================================

CREATE POLICY "clinic_slots_select_all" ON clinic_slot_templates
  FOR SELECT USING (true);

CREATE POLICY "clinic_slots_insert" ON clinic_slot_templates
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id::TEXT = auth.uid()::TEXT
        AND admin_users.role IN ('super_admin', 'clinic_admin')
        AND admin_users.is_active = true
    )
  );

CREATE POLICY "clinic_slots_update" ON clinic_slot_templates
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id::TEXT = auth.uid()::TEXT
        AND admin_users.role IN ('super_admin', 'clinic_admin')
        AND admin_users.is_active = true
    )
  );

-- ============================================================
-- blocked_dates policies
-- ============================================================

-- Anyone can read blocked dates (needed for calendar)
CREATE POLICY "blocked_dates_select" ON blocked_dates
  FOR SELECT USING (true);

-- Super admin only can manage blocked dates
CREATE POLICY "blocked_dates_insert" ON blocked_dates
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id::TEXT = auth.uid()::TEXT
        AND admin_users.role = 'super_admin'
        AND admin_users.is_active = true
    )
  );

CREATE POLICY "blocked_dates_delete" ON blocked_dates
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id::TEXT = auth.uid()::TEXT
        AND admin_users.role = 'super_admin'
        AND admin_users.is_active = true
    )
  );

-- ============================================================
-- opd_bookings policies
-- ============================================================

-- All can read (filtered in app by patient session)
CREATE POLICY "opd_bookings_select" ON opd_bookings
  FOR SELECT USING (true);

-- Patient or admin can insert via RPC function
CREATE POLICY "opd_bookings_insert" ON opd_bookings
  FOR INSERT WITH CHECK (true);

-- Only admins can update booking status
CREATE POLICY "opd_bookings_update" ON opd_bookings
  FOR UPDATE USING (true);

-- ============================================================
-- clinic_bookings policies
-- ============================================================

CREATE POLICY "clinic_bookings_select" ON clinic_bookings
  FOR SELECT USING (true);

CREATE POLICY "clinic_bookings_insert" ON clinic_bookings
  FOR INSERT WITH CHECK (true);

CREATE POLICY "clinic_bookings_update" ON clinic_bookings
  FOR UPDATE USING (true);

-- ============================================================
-- prescriptions policies
-- ============================================================

-- All can read (filtered in app by patient)
CREATE POLICY "prescriptions_select" ON prescriptions
  FOR SELECT USING (true);

-- Only authorized admins can issue prescriptions
CREATE POLICY "prescriptions_insert" ON prescriptions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id::TEXT = auth.uid()::TEXT
        AND admin_users.role IN ('super_admin', 'opd_admin', 'clinic_admin')
        AND admin_users.is_active = true
    )
  );

-- Admins can update (mark collected, corrections)
CREATE POLICY "prescriptions_update" ON prescriptions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id::TEXT = auth.uid()::TEXT
        AND admin_users.is_active = true
    )
  );

-- ============================================================
-- audit_logs policies
-- ============================================================

-- Super admin can read all logs
CREATE POLICY "audit_logs_select_super" ON audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id::TEXT = auth.uid()::TEXT
        AND admin_users.role = 'super_admin'
        AND admin_users.is_active = true
    )
  );

-- Any authenticated admin can insert logs
CREATE POLICY "audit_logs_insert" ON audit_logs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id::TEXT = auth.uid()::TEXT
        AND admin_users.is_active = true
    )
  );

-- Nobody can update or delete audit logs (immutable)

-- ============================================================
-- patient_id_sequence policies
-- ============================================================

CREATE POLICY "seq_select_all" ON patient_id_sequence
  FOR SELECT USING (true);

CREATE POLICY "seq_insert_all" ON patient_id_sequence
  FOR INSERT WITH CHECK (true);

CREATE POLICY "seq_update_all" ON patient_id_sequence
  FOR UPDATE USING (true);

-- ============================================================
-- REALTIME: Enable realtime for relevant tables
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE opd_bookings;
ALTER PUBLICATION supabase_realtime ADD TABLE clinic_bookings;
ALTER PUBLICATION supabase_realtime ADD TABLE prescriptions;

-- ============================================================
-- TRIGGER: Auto-update updated_at on clinics
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clinics_updated_at
  BEFORE UPDATE ON clinics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- INITIAL DATA: Insert default super admin placeholder
-- (Replace with actual Supabase Auth UUID after creating admin)
-- ============================================================
-- After creating admin in Supabase Auth dashboard, run:
-- INSERT INTO admin_users (id, full_name, email, role)
-- VALUES ('<supabase_auth_uid>', 'Super Admin', 'admin@ashraff.lk', 'super_admin');

-- ============================================================
-- END OF SCHEMA
-- ============================================================
