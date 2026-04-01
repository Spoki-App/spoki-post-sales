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
  city: 'city',
  country: 'country',
  phone: 'phone',
  lifecycleStage: 'lifecyclestage',
  createDate: 'createdate',
  lastModifiedDate: 'hs_lastmodifieddate',

  // Custom properties – update with your HubSpot internal names
  mrr: 'mrr',                          // Monthly Recurring Revenue
  plan: 'plan',                         // Subscription plan (e.g. "starter", "pro", "enterprise")
  renewalDate: 'renewal_date',          // Contract renewal date
  companyOwner: 'hubspot_owner_id',      // Company owner (account owner)
  onboardingOwner: 'customer_onboarding_owner', // Who follows onboarding
  successOwner: 'customer_success_owner',       // Who follows CS
  onboardingStatus: 'onboarding_status', // e.g. "not_started", "in_progress", "complete"
  contractStartDate: 'contract_start_date',
  contractValue: 'contract_value',       // Total contract value (ACV)
  churnRisk: 'churn_risk',              // manual churn risk flag if set
} as const;

export const HUBSPOT_CONTACT_PROPS = {
  email: 'email',
  firstName: 'firstname',
  lastName: 'lastname',
  phone: 'phone',
  jobTitle: 'jobtitle',
  lifecycleStage: 'lifecyclestage',
  lastActivityDate: 'notes_last_updated',
  createDate: 'createdate',
  ownerId: 'hubspot_owner_id',
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
} as const;

export const HUBSPOT_ENGAGEMENT_PROPS = {
  type: 'hs_engagement_type',
  timestamp: 'hs_timestamp',
  ownerId: 'hubspot_owner_id',
  title: 'hs_engagement_source',
} as const;
