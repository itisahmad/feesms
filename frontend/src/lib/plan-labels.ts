/** Map API plan keys (basic / standard / premium) to display labels. */
export function formatSchoolPlanLabel(plan?: string | null): string {
  switch (plan) {
    case 'basic':
      return 'Basic';
    case 'standard':
      return 'Pro';
    case 'premium':
      return 'Premium';
    default:
      return 'Pro';
  }
}
