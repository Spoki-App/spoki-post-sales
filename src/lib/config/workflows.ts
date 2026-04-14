export const AI_VOICE_WORKFLOWS = [
  {
    hubspotFlowId: '2514118886',
    label: 'Chiamata Attivazione',
    description: "L'AI vocale chiama il contatto per prenotare la call di attivazione",
    icon: 'phone' as const,
  },
  {
    hubspotFlowId: '4085384432',
    label: 'Chiamata Training',
    description: "L'AI vocale chiama il contatto per prenotare la call di training",
    icon: 'graduation-cap' as const,
  },
  {
    hubspotFlowId: '4087710958',
    label: 'Recupero Churn',
    description: "L'AI vocale contatta il cliente per capire cosa non ha funzionato",
    icon: 'alert-triangle' as const,
  },
] as const;

export type AiVoiceWorkflow = (typeof AI_VOICE_WORKFLOWS)[number];
