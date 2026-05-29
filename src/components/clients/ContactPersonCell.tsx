'use client';

const HUBSPOT_CONTACT_RECORD_BASE =
  'https://app-eu1.hubspot.com/contacts/47964451/record/0-1';

export type ContactPersonCellData = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  hubspotId: string;
};

export function ContactPersonCell({ contact }: { contact: ContactPersonCellData | null }) {
  if (!contact) {
    return <span className="text-slate-400 text-xs">—</span>;
  }
  const name =
    [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() || '—';
  return (
    <div className="min-w-0 max-w-[14rem]">
      <a
        href={`${HUBSPOT_CONTACT_RECORD_BASE}/${contact.hubspotId}`}
        target="_blank"
        rel="noreferrer"
        className="text-sm font-medium text-slate-800 hover:text-emerald-600 transition-colors"
      >
        {name}
      </a>
      {contact.email ? (
        <p className="text-xs text-slate-400 truncate" title={contact.email}>
          {contact.email}
        </p>
      ) : null}
    </div>
  );
}
