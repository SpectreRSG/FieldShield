import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { LOSS_TYPE_LABELS, PROPERTY_TYPE_LABELS, type LossType, type PropertyType } from '../domain/models';
import { useStore } from '../state/store';
import { Chips, Notice, useToast } from '../components/ui';
import { Icon } from '../components/Icon';

export function NewInspection() {
  const { createInspection, settings } = useStore();
  const navigate = useNavigate();
  const toast = useToast();
  const [claimNumber, setClaim] = useState('');
  const [title, setTitle] = useState('');
  const [lossTypes, setLoss] = useState<LossType[]>([]);
  const [reportedLossDate, setLossDate] = useState('');
  const [inspectionDate, setInspDate] = useState(new Date().toISOString().slice(0, 10));
  const [insuredName, setInsured] = useState('');
  const [addressLine, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostal] = useState('');
  const [propertyType, setPropType] = useState<PropertyType>('single_family');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!claimNumber.trim()) errs.claimNumber = 'Enter a fictional or authorised inspection reference.';
    if (lossTypes.length === 0) errs.lossTypes = 'Choose at least one loss type so a checklist can be suggested.';
    if (reportedLossDate && inspectionDate && reportedLossDate > inspectionDate)
      errs.dates = 'The reported loss date is after the inspection date — please check.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const insp = await createInspection({
        claimNumber, title, lossTypes, reportedLossDate, inspectionDate, insuredName, addressLine, city, state, postalCode, propertyType
      });
      toast('Inspection created and saved on this device', 'ok');
      navigate(`/i/${insp.id}/mission`);
    } catch (err) {
      toast(`Could not create inspection: ${err instanceof Error ? err.message : err}`, 'error');
      setSaving(false);
    }
  };

  return (
    <div className="mod-mission">
      <div className="module-head">
        <div className="module-icon">
          <Icon name="plus" />
        </div>
        <div>
          <h1>New inspection</h1>
          <p>Step 1 of the workflow. You can edit everything later.</p>
        </div>
      </div>
      {!settings.acknowledgedDataNotice && (
        <Notice kind="warn">
          Use fictional or otherwise authorised information only. FieldShield stores data in this browser on this device; it is
          not an employer-approved records system. Confirm approvals before entering real claim information.
        </Notice>
      )}
      <form className="panel stack" onSubmit={submit} noValidate>
        <div className="grid-2">
          <label className="field">
            <span>Inspection / claim reference *</span>
            <input value={claimNumber} onChange={(e) => setClaim(e.target.value)} placeholder="e.g. FS-2026-0042 (fictional)" data-testid="claim-number" aria-invalid={!!errors.claimNumber} />
            {errors.claimNumber && <span className="err">{errors.claimNumber}</span>}
          </label>
          <label className="field">
            <span>Short title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Hail — roof and gutters" data-testid="insp-title" />
          </label>
        </div>
        <fieldset>
          <legend>Loss type(s) *</legend>
          <Chips
            label="Loss types"
            multi
            options={(Object.keys(LOSS_TYPE_LABELS) as LossType[]).map((l) => ({ value: l, label: LOSS_TYPE_LABELS[l] }))}
            value={lossTypes}
            onChange={setLoss}
          />
          {errors.lossTypes && <span className="err">{errors.lossTypes}</span>}
        </fieldset>
        <div className="grid-2">
          <label className="field">
            <span>Reported loss date</span>
            <input type="date" value={reportedLossDate} onChange={(e) => setLossDate(e.target.value)} />
          </label>
          <label className="field">
            <span>Inspection date</span>
            <input type="date" value={inspectionDate} onChange={(e) => setInspDate(e.target.value)} />
          </label>
        </div>
        {errors.dates && <span className="err">{errors.dates}</span>}
        <div className="grid-2">
          <label className="field">
            <span>Insured / contact name</span>
            <input value={insuredName} onChange={(e) => setInsured(e.target.value)} placeholder="Fictional name" />
          </label>
          <label className="field">
            <span>Property type</span>
            <select value={propertyType} onChange={(e) => setPropType(e.target.value as PropertyType)}>
              {Object.entries(PROPERTY_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Street address</span>
          <input value={addressLine} onChange={(e) => setAddress(e.target.value)} />
        </label>
        <div className="grid-3">
          <label className="field">
            <span>City</span>
            <input value={city} onChange={(e) => setCity(e.target.value)} />
          </label>
          <label className="field">
            <span>State / region</span>
            <input value={state} onChange={(e) => setState(e.target.value)} />
          </label>
          <label className="field">
            <span>Postal code</span>
            <input value={postalCode} onChange={(e) => setPostal(e.target.value)} />
          </label>
        </div>
        <div className="row end">
          <button type="button" className="btn" onClick={() => navigate(-1)}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving} data-testid="create-inspection">
            <Icon name="check" /> Create inspection
          </button>
        </div>
      </form>
    </div>
  );
}
