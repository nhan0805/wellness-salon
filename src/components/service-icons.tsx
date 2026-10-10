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
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  SERVICE_ICON_CATEGORIES,
  SERVICE_ICON_OPTIONS,
  type ServiceIconCategory,
  type ServiceIconKey,
} from '@/src/domain/service-icons';

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
  const [query, setQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const pickerId = useId();
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = useMemo(
    () => SERVICE_ICON_OPTIONS.filter((option) => !normalizedQuery || `${option.label} ${option.key} ${option.category}`.toLowerCase().includes(normalizedQuery)),
    [normalizedQuery],
  );
  const filteredByCategory = (category: ServiceIconCategory) => filteredOptions.filter((option) => option.category === category);
  const selectedOption = SERVICE_ICON_OPTIONS.find((option) => option.key === value) ?? SERVICE_ICON_OPTIONS[0];
  const pickerContentId = `service-icon-picker-${pickerId}`;
  const searchId = `service-icon-search-${pickerId}`;

  return <fieldset className="service-icon-fieldset">
    <legend>Service icon</legend>
    <div className="service-icon-toolbar">
      <span className="service-icon-current" role="img" aria-label={`Selected icon: ${selectedOption.label}`} title={selectedOption.label}>
        <ServiceIcon iconKey={value} size={22} aria-hidden="true" />
      </span>
      <button type="button" className="service-icon-collapse-toggle" aria-expanded={isExpanded} aria-controls={pickerContentId} onClick={() => setIsExpanded((current) => !current)}>
        {isExpanded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
        <span>{isExpanded ? 'Hide icon choices' : 'Change icon'}</span>
      </button>
    </div>
    <div id={pickerContentId} className="service-icon-picker-body" hidden={!isExpanded}>
      <div className="service-icon-search field">
        <label htmlFor={searchId}>Search icons</label>
        <div className="service-icon-search-control">
          <Search size={17} aria-hidden="true" />
          <input id={searchId} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or category" />
        </div>
      </div>
      <div className="service-icon-groups">
        {SERVICE_ICON_CATEGORIES.map((category) => {
          const options = filteredByCategory(category);
          if (!options.length) return null;
          return <section className="service-icon-group" key={category} aria-labelledby={`service-icon-${category.replaceAll(/[^a-z0-9]+/gi, '-').toLowerCase()}`}>
            <h4 id={`service-icon-${category.replaceAll(/[^a-z0-9]+/gi, '-').toLowerCase()}`}>{category}</h4>
            <div className="service-icon-grid">
              {options.map((option) => {
                const selected = option.key === value;
                return <button key={option.key} type="button" className={`service-icon-option ${selected ? 'selected' : ''}`} onClick={() => onChange(option.key)} aria-label={`Use ${option.label} icon`} aria-pressed={selected} title={option.label}>
                  <span className="service-icon-option-art"><ServiceIcon iconKey={option.key} size={21} aria-hidden="true" /></span>
                  {selected ? <Check className="service-icon-option-check" size={16} aria-hidden="true" /> : null}
                </button>;
              })}
            </div>
          </section>;
        })}
      </div>
      {!filteredOptions.length ? <p className="service-icon-empty" role="status">No icons match “{query}”.</p> : null}
      <span className="field-hint">Choose one of the 50 curated icons. The icon style stays consistent across the salon.</span>
    </div>
  </fieldset>;
}
