'use client';

import { createElement, useId, useMemo, useState, type ComponentProps } from 'react';
import {
  Accessibility,
  Activity,
  Armchair,
  Baby,
  BadgePlus,
  Bandage,
  Bath,
  BedDouble,
  Bone,
  Brain,
  Brush,
  Cross,
  Dna,
  Droplets,
  Eye,
  Flower,
  Flower2,
  Footprints,
  Gem,
  Hand,
  Heart,
  HeartPulse,
  Leaf,
  Microscope,
  Moon,
  Palette,
  PersonStanding,
  Pill,
  ScanHeart,
  Scissors,
  Search,
  ShieldPlus,
  Shell,
  ShowerHead,
  Smile,
  Snowflake,
  Sparkles,
  SprayCan,
  Sprout,
  Star,
  Stethoscope,
  Sun,
  Syringe,
  TestTube,
  TestTubes,
  Thermometer,
  TreePalm,
  WandSparkles,
  Waves,
  WavesLadder,
  Wind,
  Check,
  X,
} from 'lucide-react';
import {
  SERVICE_ICON_CATEGORIES,
  SERVICE_ICON_OPTIONS,
  type ServiceIconCategory,
  type ServiceIconKey,
} from '@/src/domain/service-icons';
import { useDialogFocus } from '@/src/components/use-dialog-focus';

const SERVICE_ICON_COMPONENTS = {
  hand: Hand,
  footprints: Footprints,
  sparkles: Sparkles,
  'flower-2': Flower2,
  flower: Flower,
  brush: Brush,
  palette: Palette,
  'wand-sparkles': WandSparkles,
  gem: Gem,
  scissors: Scissors,
  'spray-can': SprayCan,
  shell: Shell,
  eye: Eye,
  smile: Smile,
  star: Star,
  bath: Bath,
  'shower-head': ShowerHead,
  waves: Waves,
  'waves-ladder': WavesLadder,
  'bed-double': BedDouble,
  armchair: Armchair,
  leaf: Leaf,
  sprout: Sprout,
  droplets: Droplets,
  'tree-palm': TreePalm,
  sun: Sun,
  moon: Moon,
  wind: Wind,
  snowflake: Snowflake,
  heart: Heart,
  'heart-pulse': HeartPulse,
  activity: Activity,
  stethoscope: Stethoscope,
  pill: Pill,
  syringe: Syringe,
  thermometer: Thermometer,
  bandage: Bandage,
  bone: Bone,
  brain: Brain,
  microscope: Microscope,
  'test-tube': TestTube,
  'test-tubes': TestTubes,
  dna: Dna,
  cross: Cross,
  'shield-plus': ShieldPlus,
  'badge-plus': BadgePlus,
  accessibility: Accessibility,
  'person-standing': PersonStanding,
  baby: Baby,
  'scan-heart': ScanHeart,
} satisfies Record<ServiceIconKey, typeof Hand>;

export function getServiceIconComponent(iconKey: string | null | undefined) {
  return SERVICE_ICON_COMPONENTS[iconKey as ServiceIconKey] ?? SERVICE_ICON_COMPONENTS.sparkles;
}

export function ServiceIcon({ iconKey, ...props }: { iconKey?: string | null } & ComponentProps<typeof Hand>) {
  return createElement(getServiceIconComponent(iconKey), props);
}

export function ServiceIconPicker({ value, onChange }: { value: ServiceIconKey; onChange: (value: ServiceIconKey) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = SERVICE_ICON_OPTIONS.find((option) => option.key === value) ?? SERVICE_ICON_OPTIONS[0];

  return <>
    <button type="button" className="service-icon-picker-trigger" aria-haspopup="dialog" aria-label={`Change service icon. Current icon: ${selectedOption.label}`} title={`Change service icon: ${selectedOption.label}`} onClick={() => setIsOpen(true)}>
      <span className="service-icon-current" aria-hidden="true"><ServiceIcon iconKey={value} size={25} /></span>
    </button>
    {isOpen ? <ServiceIconDialog value={value} onApply={onChange} onClose={() => setIsOpen(false)} /> : null}
  </>;
}

function ServiceIconDialog({ value, onApply, onClose }: { value: ServiceIconKey; onApply: (value: ServiceIconKey) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [draftValue, setDraftValue] = useState(value);
  const pickerId = useId();
  const dialogRef = useDialogFocus(true, onClose, { stopPropagation: true });
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = useMemo(
    () => SERVICE_ICON_OPTIONS.filter((option) => !normalizedQuery || `${option.label} ${option.key} ${option.category}`.toLowerCase().includes(normalizedQuery)),
    [normalizedQuery],
  );
  const filteredByCategory = (category: ServiceIconCategory) => filteredOptions.filter((option) => option.category === category);
  const draftOption = SERVICE_ICON_OPTIONS.find((option) => option.key === draftValue) ?? SERVICE_ICON_OPTIONS[0];
  const titleId = `service-icon-dialog-title-${pickerId}`;
  const searchId = `service-icon-search-${pickerId}`;

  return <div className="modal-backdrop service-icon-modal-backdrop">
    <div className="modal service-icon-modal" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="modal-header">
        <div><h2 id={titleId}>Choose service icon</h2><p>Pick an icon to represent this service on the kiosk.</p></div>
        <button type="button" className="modal-close" aria-label="Close service icon dialog" onClick={onClose}><X size={19} aria-hidden="true" /></button>
      </div>
      <div className="service-icon-modal-body">
        <div className="service-icon-search field">
          <label htmlFor={searchId}>Search icons</label>
          <div className="service-icon-search-control">
            <Search size={17} aria-hidden="true" />
            <input data-dialog-focus id={searchId} name="service-icon-search" type="search" autoComplete="off" enterKeyHint="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or category…" />
          </div>
        </div>
        <div className="service-icon-groups">
          {SERVICE_ICON_CATEGORIES.map((category) => {
            const options = filteredByCategory(category);
            if (!options.length) return null;
            const categoryId = `service-icon-${pickerId}-${category.replaceAll(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
            return <section className="service-icon-group" key={category} aria-labelledby={categoryId}>
              <h4 id={categoryId}>{category}</h4>
              <div className="service-icon-grid">
                {options.map((option) => {
                  const selected = option.key === draftValue;
                  return <button key={option.key} type="button" className={`service-icon-option ${selected ? 'selected' : ''}`} onClick={() => setDraftValue(option.key)} aria-label={`Use ${option.label} icon`} aria-pressed={selected} title={option.label}>
                    <span className="service-icon-option-art"><ServiceIcon iconKey={option.key} size={21} aria-hidden="true" /></span>
                    {selected ? <Check className="service-icon-option-check" size={16} aria-hidden="true" /> : null}
                  </button>;
                })}
              </div>
            </section>;
          })}
        </div>
        {!filteredOptions.length ? <p className="service-icon-empty" role="status">No icons match “{query}”.</p> : null}
      </div>
      <div className="form-actions service-icon-modal-actions">
        <button type="button" className="button button-quiet" onClick={onClose}>Cancel</button>
        <button type="button" className="button button-primary" onClick={() => { onApply(draftValue); onClose(); }}><ServiceIcon iconKey={draftValue} size={17} aria-hidden="true" /> Use {draftOption.label}</button>
      </div>
    </div>
  </div>;
}
