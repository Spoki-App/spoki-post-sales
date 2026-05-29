/**
 * Mapping of HubSpot custom property names for your account.
 * Update these values to match the technical property names in your HubSpot portal.
 * To find them: HubSpot > Settings > Properties > search for the property > copy the internal name.
 */
export const HUBSPOT_COMPANY_PROPS = {
  // Standard properties (safe to leave as-is)
  name: 'name',
  domain: 'domain',
  industry: 'industry',
  /** Spoki vertical / industry segment (HubSpot internal name: verify in portal) */
  industrySpoki: 'industry_spoki',
  city: 'city',
  country: 'country',
  phone: 'phone',
  lifecycleStage: 'lifecyclestage',
  createDate: 'createdate',
  lastModifiedDate: 'hs_lastmodifieddate',
  notesLastUpdated: 'notes_last_updated',
  lastBookedMeeting: 'hs_last_booked_meeting_date',

  // Custom properties – update with your HubSpot internal names
  mrr: 'mrr',                          // Monthly Recurring Revenue
  plan: 'plan_activated',                // Subscription plan (e.g. "service", "starter", "pro")
  renewalDate: 'plan_expire_date',      // Plan expiration / renewal date
  companyOwner: 'hubspot_owner_id',      // Company owner (account owner)
  onboardingOwner: 'customer_onboarding_owner', // Who follows onboarding
  successOwner: 'customer_success_owner',       // Who follows CS
  onboardingStatus: 'onboarding_status', // e.g. "not_started", "in_progress", "complete"
  contractStartDate: 'contract_start_date',
  contractValue: 'contract_value',       // Total contract value (ACV)
  churnRisk: 'churn_risk',              // manual churn risk flag if set
  /**
   * Optional company property for account quality (number 0–100, or picklist text aligned with churn colours).
   * When set and sync runs, value is in `clients.raw_properties` and takes priority over `churn_risk` for the quality dot.
   */
  accountQualityScore: '',
  /** Company property "Activation call" (date) — internal name from HubSpot */
  activationCall: 'activation_call',
  /**
   * HubSpot company property whose value is the **Contact record ID** (numeric string) of the primary contact.
   * Optional when sync writes {@link SYNC_RAW_PRIMARY_CONTACT_HUBSPOT_ID_KEY} from native CRM associations.
   */
  primaryContactHubspotId: '',
  conversationsUsed: '',
  conversationsIncluded: '',
  /**
   * HubSpot company property che contiene l'identificativo numerico univoco dell'account Spoki
   * (es. "12345"). Usato dal modulo NAR Dashboard per risolvere account_id → cs_owner_id senza
   * caricare un CSV operatori manuale.
   */
  spokiCompanyIdUnique: 'spoki_company_id_unique',
  /**
   * Company property che contiene l'ID numerico del partner per gli account ingaggiati tramite
   * un partner Spoki. Vuoto = cliente diretto. Usato dal modulo NAR per separare i bucket
   * "Direct" da "Partner Child".
   *
   * Internal name configurabile via env `HUBSPOT_COMPANY_PROP_PARTNER_ID` (in attesa che l'admin
   * lo derivi tramite GET /api/v1/hubspot/properties/discover?filter=partner). Lasciato vuoto
   * finche' non configurato: senza valore valido viene escluso da {@link companyRawPropertyKeysForDb}.
   */
  partnerId: process.env.HUBSPOT_COMPANY_PROP_PARTNER_ID ?? '',
  /**
   * Company property che contiene la categoria del partner (es. "referral", "hubpanel", ecc.).
   * Internal name configurabile via env `HUBSPOT_COMPANY_PROP_PARTNER_TYPE`. Vedi {@link partnerId}
   * per la procedura di discovery.
   */
  partnerType: process.env.HUBSPOT_COMPANY_PROP_PARTNER_TYPE ?? '',
} as const;

/**
 * Injected into `clients.raw_properties` during company sync from HubSpot associations (company → primary contact, typeId 2). Not a HubSpot property.
 */
export const SYNC_RAW_PRIMARY_CONTACT_HUBSPOT_ID_KEY = '_hubspot_primary_contact_id' as const;

/** Property internal names sent to HubSpot APIs (empty configured keys omitted). */
export function getHubspotCompanyPropertiesForApiRequest(): string[] {
  return (Object.values(HUBSPOT_COMPANY_PROPS) as string[]).filter(v => typeof v === 'string' && v.trim().length > 0);
}

export const HUBSPOT_CONTACT_PROPS = {
  email: 'email',
  firstName: 'firstname',
  lastName: 'lastname',
  phone: 'phone',
  jobTitle: 'jobtitle',
  lifecycleStage: 'lifecyclestage',
  lastActivityDate: 'notes_last_updated',
  communicationRole: 'communications_role',
  createDate: 'createdate',
  ownerId: 'hubspot_owner_id',
  /**
   * HubSpot system property kept in sync with the contact's primary company association.
   * Source of truth for `HSContact.companyId` (the v3 associations array order is not stable).
   */
  associatedCompanyId: 'associatedcompanyid',
} as const;

/**
 * Substring matched on `contacts.communication_roles` (case-insensitive) in portfolio-only contact pick order, after company primary contact ID.
 * If HubSpot uses a different label, update this value only (not user input).
 */
export const PORTFOLIO_CONTACT_ROLE_MATCH = {
  spokiConnectionContact: 'Spoki Connection contact',
} as const;

export const HUBSPOT_TICKET_PROPS = {
  subject: 'subject',
  content: 'content',
  status: 'hs_pipeline_stage',
  priority: 'hs_ticket_priority',
  createDate: 'createdate',
  lastModifiedDate: 'hs_lastmodifieddate',
  closeDate: 'closed_date',
  ownerId: 'hubspot_owner_id',
  pipeline: 'hs_pipeline',
  activatedAt: 'hs_date_entered_2',
} as const;

export const HUBSPOT_ENGAGEMENT_PROPS = {
  type: 'hs_engagement_type',
  timestamp: 'hs_timestamp',
  ownerId: 'hubspot_owner_id',
  title: 'hs_engagement_source',
} as const;

export const HUBSPOT_DEAL_PROPS = {
  mrr: 'mrr',
  amount: 'amount',
  closedWon: 'hs_is_closed_won',
  dealstage: 'dealstage',
} as const;

/**
 * Deal rollup when company MRR is null, non-finite, or <= 0 (see enrichCompaniesMrrFromDeals).
 */
export const HUBSPOT_DEAL_SYNC = {
  onlyClosedWonDeals: true,
  /** If deal has no MRR property set, use amount ÷ 12 (annual contract → monthly). */
  fallbackAnnualAmountToMonthly: true,
  /**
   * Optional HubSpot internal deal stage IDs treated as "won" when combined with hs_is_closed_won.
   * If non-empty, a deal counts as won if hs_is_closed_won is true OR dealstage is in this list.
   */
  wonDealStageIds: [] as readonly string[],
} as const;
