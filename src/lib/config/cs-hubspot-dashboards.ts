/**
 * Dashboard Reporting HubSpot in embed (iframe) per owner CS.
 * In HubSpot: Reporting → dashboard → Condividi / Incorpora → copia URL “Incorpora” se la vista non carica in iframe.
 * Chiave = HubSpot owner id (HUBSPOT_OWNERS).
 */
export interface CsHubspotDashboardEmbed {
  title: string;
  /** URL da usare come src dell’iframe */
  embedUrl: string;
  /** Apri nel browser (stesso report o vista completa) */
  openUrl: string;
}

export const CS_HUBSPOT_DASHBOARD_EMBED: Partial<Record<string, CsHubspotDashboardEmbed>> = {
  '75723356': {
    title: 'Dashboard HubSpot',
    embedUrl: 'https://app-eu1.hubspot.com/reports-dashboard/47964451/view/110994181',
    openUrl: 'https://app-eu1.hubspot.com/reports-dashboard/47964451/view/110994181',
  },
};
