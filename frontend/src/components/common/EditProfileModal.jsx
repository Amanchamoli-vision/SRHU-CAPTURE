import { useEffect, useState } from "react";
import Modal from "../teacher/Modal";
import { normalizePhoneInput, isValidPhone } from "../../utils/phone";
import { updateProfile } from "../../services/auth";
import {
  IconBuilding,
  IconCheck,
  IconEdit,
  IconPhone,
  IconUser,
} from "../teacher/icons";

const SUGGESTED_DEPARTMENTS = [
  "Department of Computer Science & Engineering",
  "Department of Mechanical Engineering",
  "Department of Civil Engineering",
  "Department of Electrical & Electronics Engineering",
  "Department of Management Studies",
  "Himalayan Institute of Medical Sciences",
  "Himalayan College of Nursing",
  "Himalayan School of Pharmaceutical Sciences",
  "Himalayan School of Yoga Sciences",
  "Department of Biosciences",
];

export default function EditProfileModal({
  open,
  onClose,
  profile,
  onSaved,
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [department, setDepartment] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState("");

  // Pre-fill existing profile data when the modal opens
  useEffect(() => {
    if (open && profile) {
      setName(profile.name || "");
      setPhone(normalizePhoneInput(profile.phone || ""));
      setDepartment(profile.department || "");
      setErrors({});
      setApiError("");
    }
  }, [open, profile]);

  const handlePhoneChange = (e) => {
    // Restrict to digits only and max 10 digits
    const cleaned = normalizePhoneInput(e.target.value);
    setPhone(cleaned);
    if (errors.phone) {
      setErrors((prev) => ({ ...prev, phone: "" }));
    }
  };

  const handleNameChange = (e) => {
    setName(e.target.value);
    if (errors.name) {
      setErrors((prev) => ({ ...prev, name: "" }));
    }
  };

  const handleDepartmentChange = (e) => {
    setDepartment(e.target.value);
    if (errors.department) {
      setErrors((prev) => ({ ...prev, department: "" }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;

    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    const trimmedDept = department.trim();

    const newErrors = {};
    if (!trimmedName) {
      newErrors.name = "Full name is required.";
    }

    if (trimmedPhone && !isValidPhone(trimmedPhone)) {
      newErrors.phone = "Mobile number must be exactly 10 digits.";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      setSaving(true);
      setApiError("");

      const result = await updateProfile({
        name: trimmedName,
        phone: trimmedPhone || null,
        department: trimmedDept || null,
      });

      const updatedUser = result?.user || {
        ...profile,
        name: trimmedName,
        phone: trimmedPhone || null,
        department: trimmedDept || null,
      };

      onSaved?.(updatedUser);
      onClose();
    } catch (err) {
      console.error("Failed to update profile:", err);
      setApiError(err?.message || "Failed to update profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      eyebrow="Account Details"
      title="Edit Profile"
      subtitle="Update your name, department, and contact information"
      zIndex={70}
      footer={
        <div className="flex w-full items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="btn btn-ghost btn-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="btn btn-primary btn-sm"
          >
            {saving ? (
              <>
                <span className="spin h-4 w-4" />
                Saving…
              </>
            ) : (
              <>
                <IconCheck className="h-4 w-4" />
                Save changes
              </>
            )}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {apiError && (
          <div className="rounded-xl border border-err/30 bg-err/10 p-3 text-xs font-medium text-err" role="alert">
            {apiError}
          </div>
        )}

        {/* Full Name */}
        <div className="field">
          <label htmlFor="profile-name">
            Full Name <span className="req">*</span>
          </label>
          <div className="relative">
            <input
              id="profile-name"
              type="text"
              className="input"
              value={name}
              onChange={handleNameChange}
              placeholder="e.g. Dr. Rajesh Sharma"
              disabled={saving}
              autoComplete="name"
              aria-invalid={errors.name ? "true" : undefined}
            />
          </div>
          {errors.name && <p className="field-error">{errors.name}</p>}
        </div>

        {/* Mobile Number */}
        <div className="field">
          <label htmlFor="profile-phone">
            Mobile Number
          </label>
          <div className="relative">
            <input
              id="profile-phone"
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={10}
              className="input"
              value={phone}
              onChange={handlePhoneChange}
              placeholder="10-digit mobile number"
              disabled={saving}
              autoComplete="tel"
              aria-invalid={errors.phone ? "true" : undefined}
            />
          </div>
          <p className="prose-muted mt-1 text-[11px]">
            {phone.length > 0 ? `${phone.length}/10 digits` : "Numeric only, 10 digits without prefix (+91 or 0)"}
          </p>
          {errors.phone && <p className="field-error">{errors.phone}</p>}
        </div>

        {/* Department */}
        <div className="field">
          <label htmlFor="profile-department">
            Department / School
          </label>
          <div className="relative">
            <input
              id="profile-department"
              list="srhu-department-options"
              type="text"
              className="input"
              value={department}
              onChange={handleDepartmentChange}
              placeholder="e.g. Department of Computer Science & Engineering"
              disabled={saving}
              aria-invalid={errors.department ? "true" : undefined}
            />
            <datalist id="srhu-department-options">
              {SUGGESTED_DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept} />
              ))}
            </datalist>
          </div>
          <p className="prose-muted mt-1 text-[11px]">
            Your academic department, school, or administrative unit.
          </p>
          {errors.department && <p className="field-error">{errors.department}</p>}
        </div>
      </form>
    </Modal>
  );
}
