/**
 * Dashboard HubSpot da incorporare per utente CS (embed URL).
 * In HubSpot: Reporting → apri la dashboard → menu → Condividi / Incorpora → copia URL iframe.
 * Chiave = HubSpot owner id (stesso di HUBSPOT_OWNERS).
 */
export interface CsHubspotDashboardLink {
  title: string;
  /** URL per iframe (embed). Se vuoto, mostra solo il link esterno. */
  embedUrl: string;
  /** Apri nel browser / HubSpot (fallback se l’embed non è consentito). */
  openUrl?: string;
}

export const CS_HUBSPOT_DASHBOARDS: Record<string, CsHubspotDashboardLink[]> = {
  '75723356': [
    {
      title: 'Dashboard CS (Marco)',
      embedUrl: '',
      openUrl: 'https://app.hubspot.com/reporting',
    },
  ],
};
