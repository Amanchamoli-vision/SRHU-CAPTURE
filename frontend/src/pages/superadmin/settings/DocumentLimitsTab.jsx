import NumberLimitField from "../../../components/superadmin/settings/NumberLimitField";
import SettingsCard from "../../../components/superadmin/settings/SettingsCard";
import { IconFileText } from "../../../components/teacher/icons";

export default function DocumentLimitsTab({ values, bounds, errors, disabled, onChange }) {
  const field = (name, props) => (
    <NumberLimitField
      id={name.replace(/_/g, "-")}
      name={name}
      bound={bounds[name]}
      value={values[name]}
      error={errors[name]}
      disabled={disabled}
      onChange={onChange}
      {...props}
    />
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <SettingsCard
        index={1}
        icon={<IconFileText />}
        eyebrow="Reports & supporting files"
        title="Document upload limits"
        chip="PDF, DOC, XLS, PPT, TXT, CSV"
        description="Supporting documents attached to an event: brochures, attendance sheets, permission letters and the like."
      >
        {field("max_documents_per_event", {
          label: "Max documents per event",
          hint: "Stops an unbounded number of small files being attached.",
        })}

        {field("max_documents_total_mb", {
          label: "Combined size of all documents",
          unit: "MB",
          hint: "Documents have no separate per-file cap, so this is also the largest single document allowed.",
        })}
      </SettingsCard>

      <div className="glass reveal flex flex-col justify-center p-5 sm:p-7" style={{ "--i": 2 }}>
        <p className="eyebrow">Why only two settings</p>
        <p className="prose-muted mt-3 text-sm">
          Documents are budgeted by combined size on purpose. Ten 1 MB files and one
          10 MB file cost the same storage, so the teacher is left free to choose —
          which is why there is no per-document size limit to configure here.
        </p>
      </div>
    </div>
  );
}
