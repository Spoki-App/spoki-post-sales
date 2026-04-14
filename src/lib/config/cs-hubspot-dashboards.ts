/**
 * Link opzionale al report HubSpot (solo riferimento in app; niente iframe).
 * Chiave = HubSpot owner id (HUBSPOT_OWNERS).
 */
export interface CsHubspotReferenceLink {
  label: string;
  url: string;
}

export const CS_HUBSPOT_REFERENCE_LINKS: Record<string, CsHubspotReferenceLink | null> = {
  '75723356': {
    label: 'Apri report in HubSpot',
    url: 'https://app-eu1.hubspot.com/reports-dashboard/47964451/view/110994181',
  },
};
